#!/usr/bin/env node

var sys = require('sys');
var exec = require('child_process').exec;
var path = require('path');

function dir(name) {
  return path.normalize(__dirname + '/../' + name);
}

exec(
  'node ' + dir('node_modules/istanbul/lib/cli.js') + ' cover '
  + dir('node_modules/mocha/bin/_mocha') + ' '
  + dir('test')
  + ' -- -R spec -t 2000'
  , function (error, stdout, stderr) {
    sys.print(stdout);
    sys.print(stderr);
    if (error !== null) {
      console.log('\n' + error);
      process.exit(1);
    }
    exec(
      (/^win/.test(process.platform) ? 'type' : 'cat')
      + ' ' +dir('coverage/lcov.info')
      + ' | node ' + dir('node_modules/coveralls/bin/coveralls.js'),
      function(error, stdout, stderr) {
        sys.print(stdout);
        sys.print(stderr);
      }
    );
  }
);