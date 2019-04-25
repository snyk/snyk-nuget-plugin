'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/CoreProjectNameInAssets/';
const manifestFile = 'obj/project.assets.json';
const expectedTreeWithAssetsProjectNameArgument
  = require('./stubs/CoreProjectNameInAssets/expectedWithAssetsProjectNameArgument.json');
const expectedTreeWithoutAssetsProjectNameArgument
  = require('./stubs/CoreProjectNameInAssets/expectedWithoutAssetsProjectNameArgument.json');

test('parse core with project name in project assets file with assets-project-name', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile,
    {'assets-project-name': true})
    .then(function (result) {
      t.deepEqual(
        result,
        expectedTreeWithAssetsProjectNameArgument,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (error) {
      t.fail('Error was thrown: ' + error);
    });
});

test('parse core with project name in project assets file without assets-project-name', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile)
    .then(function (result) {
      t.deepEqual(
        result,
        expectedTreeWithoutAssetsProjectNameArgument,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (error) {
      t.fail('Error was thrown: ' + error);
    });
});
