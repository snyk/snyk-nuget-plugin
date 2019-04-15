'use strict';

const test = require('tap').test;
const plugin = require('../lib/index');
const projectPath = './test/stubs/packages-config-no-deps/';

test('parse packages-config-no-deps project successfully', function (t) {
  plugin.inspect(
    projectPath,
    'packages.config',
    {
      packagesFolder: projectPath + './_packages',
    })
    .then(function () {
      t.pass('parsed file correctly');
      t.end();
    })
    .catch(function () {
      t.fail('failed parsing a project with no deps');
    });
});
