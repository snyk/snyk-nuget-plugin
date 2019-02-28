'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/dummy_project_2/';
const manifestFile = 'obj/project.assets.json';

test('parse dotnet-cli project without frameworks field', function (t) {
  plugin.inspect(
    projectPath,
    manifestFile,
    {
      packagesFolder: projectPath + './_packages',
    }).then(function () {
    t.fail('Expected an error to be thrown');
  })
    .catch(function (error) {
      t.equals(error.message,
        'No frameworks were found in project.assets.json');
      t.end();
    });
});
