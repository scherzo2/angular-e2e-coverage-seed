# E2eCoverage
Angularのe2eテストでカバレッジを取得する設定を行った初期プロジェクトです。

## 実行手順
- npmモジュールのインストール  
  ```
  npm install 
  ```
- angular-cli(@angular-devkit/build-angular)へのパッチ適用  
  patchディレクトリ以下に@angular-devkit/build-angularに対するパッチが置いてありますが、
  これらはバージョン0.10.7に対するパッチになります。
  バージョンが異なる場合は下の方の解説を読んで自身で差分をマージしてください。
  パッチを当てる場合は、これらを下の要領でコピーしてください。
  ```
  cp patch/build-angular/src/dev-server/index.js node_modules/@angular-devkit/build-angular/src/dev-server/
  cp patch/build-angular/src/protractor/index.js node_modules/@angular-devkit/build-angular/src/protractor/
  cp patch/build-angular/src/protractor/schema.json node_modules/@angular-devkit/build-angular/src/protractor/
  ```
- e2eテストを実行  
  --codeCoverageオプションを付与するとe2eテストでカバレッジ取得できます。
  カバレッジファイル(coverage.json)はe2e-coverageに出力されます。
  ```
  ng e2e --codeCoverage
  ```
- カバレッジのHTMLレポート出力  
  あらかじめnode_modules/.binをパスに通しておき、以下を実行します。  
  ```
  istanbul report --include e2e-coverage/*.json --dir e2e-coverage html

## 仕組みの解説とangular-cliの修正内容

### 概要

angular-cliはe2eテストでカバレッジを取得できません。e2eテストでカバレッジを取得するためには、
(1)e2eテスト用コードにカバレッジ取得用コードを含めた上で、
(2)カバレッジ取得処理を実行、する必要があります。

1. e2eテスト用コードにカバレッジ取得コードを含める  
  Angular-cliのユニットテストでは、webpackにistanbul-instrumenter-loaderプラグインを
  追加することでカバレッジ取得用コードを生成しています。
  e2eテストではこのプラグインが追加されないため、カバレッジ取得用コードが生成されません。
  そこでAngular-cliに対して、e2eテストでも上記プラグインを追加するための修正を行います。

2. e2eテスト終了時にブラウザからカバレッジ情報を取得  
  istanbulでは、ブラウザのグローバル変数「\_\_coverage\_\_」にカバレッジ情報を記録します。
  e2eテスト終了時にこれをブラウザから取得します。
  どうやって取得するかというと、あらかじめカバレッジ取得用サーバ(coverage-collector)を
  立てておいて、e2eテスト終了時にブラウザからカバレッジ情報を上記サーバにHTTP POSTで
  送り込みます。
  その後protractorは、上記サーバからカバレッジ情報を取得し、ファイルに書き出します。

### Angular-cliの修正

- node_modules/@angular-devkit/build-angular/src/protractor/schema.json の修正  
  properties以下に追加することで、ng e2eで--codeCoverageオプションが指定できるようになります。
  ```
    "codeCoverage": {
      "type": "boolean",
      "description": "Output a code coverage report.",
      "default": false
    },
  ```
- node_modules\@angular-devkit\build-angular\src\protractor\index.jsの修正  
  65行目付近に以下を追加。ここではbuilderに渡すオプションを設定しています。
  ```
            // Save the computed baseUrl back so that Protractor can use it.
            options.baseUrl = baseUrl;
    // ++ここから
    if (options.codeCoverage) {
        builderConfig.options.codeCoverage = true;
    }
    // --ここまで
            return rxjs_1.of(this.context.architect.getBuilder(devServerDescription, this.context));
        }), operators_1.concatMap(builder => builder.run(builderConfig)));
  ```
- node_modules\@angular-devkit\build-angular\src\dev-server\index.jsの修正  
  46行目付近に以下を追加。ここではカバレッジ取得用コード生成のための
  プラグイン(istanbul-instrumenter-loader)をwebpackに設定しています。
  ```
            try {
                webpackDevServerConfig = this._buildServerConfig(root, projectRoot, options, browserOptions);
            }
            catch (err) {
                return rxjs_1.throwError(err);
            }
    // ++ここから
        if (options.codeCoverage) {
            webpackConfig.module.rules.push({
                test: /\.(js|ts)$/,
                loader: 'istanbul-instrumenter-loader',
                options: { esModules: true },
                enforce: 'post',
                exclude: /node_modules|\.spec\.js$/,
            });
        }
    // --ここまで
            // Resolve public host and client address.
  ```
### protractor.conf.jsの修正

  基本的に以下の処理を行うためのコードを追加しています。詳しくはコードを参照してください。
  1. e2eテスト起動時にカバレッジ取得用サーバを起動  
    onPrepare()に以下を追加します。  
      ```
      // カバレッジ取得用サーバを起動
      collector({port:3001});
      ```
  2. e2eテスト終了時にカバレッジを取得しファイルに書き出し  
      onComplete()で以下のように処理します。
      ```
      onComplete() {
        // ブラウザからカバレッシュ取得用サーバにカバレッジ情報を送信
        browser.executeScript(function() {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', 'http://localhost:3001/data', false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(JSON.stringify(window.__coverage__));
        }).then(function(v) {
          console.log('coverage data is obtained');
          // カバレッジ取得サーバからカバレッジ情報を回収
          const coveragePath = 'e2e-coverage';
          return new Promise((resolve, reject) => {
            http.get('http://localhost:3001/data', (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                mkdirp.sync(coveragePath);
                fs.writeFileSync(path.join(coveragePath, 'coverage.json'), body);
                resolve();
            });
            });
          });
        }, function (error) {
            console.log('failed to extract coverage data');
        });
      },
      ```
