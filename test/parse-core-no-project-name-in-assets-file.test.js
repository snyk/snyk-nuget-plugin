'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/coreNoProjectNameInAssets/';
const manifestFile = 'obj/project.assets.json';
const expectedTree = require('./stubs/coreNoProjectNameInAssets/expected.json');

test('parse core without project name in project assets file with assets-project-name argument', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile,
    {'assets-project-name': true})
    .then(function (result) {
      t.deepEqual(
        result,
        expectedTree,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (error) {
      t.fail('Error was thrown: ' + error);
    });
});

test('parse core without project name in project assets file without assets-project-name argument', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile)
    .then(function (result) {
      t.deepEqual(
        result,
        expectedTree,
        'expects project data to be correct'
      );
      t.end();
    })
    .catch(function (error) {
      t.fail('Error was thrown: ' + error);
    });
});
