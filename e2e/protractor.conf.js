// Protractor configuration file, see link for more information
// https://github.com/angular/protractor/blob/master/lib/config.ts

const { SpecReporter } = require('jasmine-spec-reporter');
const collector = require('coverage-collector');
const http = require('http');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');

exports.config = {
  allScriptsTimeout: 11000,
  specs: [
    './src/**/*.e2e-spec.ts'
  ],
  capabilities: {
    'browserName': 'chrome',
  // クロスドメインアクセスを許可する(chromeの場合)
  chromeOptions: {
      args: ['--disable-web-security']
    }
  },
  directConnect: true,
  baseUrl: 'http://localhost:4200/',
  framework: 'jasmine',
  jasmineNodeOpts: {
    showColors: true,
    defaultTimeoutInterval: 30000,
    print: function() {}
  },
  onPrepare() {
    require('ts-node').register({
      project: require('path').join(__dirname, './tsconfig.e2e.json')
    });
    jasmine.getEnv().addReporter(new SpecReporter({ spec: { displayStacktrace: true } }));
    // カバレッジ取得用サーバを起動
    collector({port:3001});
  },
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
};