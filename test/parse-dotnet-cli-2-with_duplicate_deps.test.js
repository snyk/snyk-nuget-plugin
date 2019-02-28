'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/dotnet_2/';
const manifestFile = projectPath + 'obj/project.assets.json';
const expectedTree = require('./stubs/dotnet_2/expected.json');

test('parse dotnet-cli 2 with duplicate deps project and traverse packages',
  function (t) {
    plugin.inspect(
      null,
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
