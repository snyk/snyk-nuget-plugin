'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');

const stubsDir = './test/stubs';
const simplePaket = stubsDir + '/simple-paket/';
const missingLock = stubsDir + '/paket-missing-lock/';

const simplePaketDeps = {
  'FSharp.Formatting': {
    depType: 'prod',
    dependencies: {
      'FSharp.Compiler.Service': {
        depType: 'prod',
        dependencies: {},
        name: 'FSharp.Compiler.Service',
        version: '2.0.0.6',
      },
      'FSharpVSPowerTools.Core': {
        depType: 'prod',
        dependencies: {
          'FSharp.Compiler.Service': {
            depType: 'prod',
            dependencies: {},
            name: 'FSharp.Compiler.Service',
            version: '2.0.0.6',
          },
        },
        name: 'FSharpVSPowerTools.Core',
        version: '2.3',
      },
    },
    name: 'FSharp.Formatting',
    version: '2.14.4',
  },
  FAKE: {
    depType: 'prod',
    dependencies: {},
    name: 'FAKE',
    version: '5.8.4',
  },
};


test('parse simple-paket project', function (t) {
  plugin.inspect(simplePaket, 'paket.dependencies')
    .then(function (tree) {
      t.deepEquals(tree.package.dependencies, simplePaketDeps, 'expected dependencies');
      t.equals(tree.package.name, 'simple-paket', 'correct name');
      t.end();
    }).catch(function (err) {
      t.fail('did not expect error' + err);
    });
});

test('parse simple-paket project from upper dir', function (t) {
  plugin.inspect(stubsDir, 'simple-paket/paket.dependencies')
    .then(function (tree) {
      t.deepEquals(tree.package.dependencies, simplePaketDeps, 'expected dependencies');
      t.equals(tree.package.name, 'simple-paket', 'correct name');
      t.end();
    }).catch(function (err) {
      t.fail('did not expect error ' + err);
    });
});

test('fail to parse paket with missing lock file project', function (t) {
  plugin.inspect(missingLock, 'paket.dependencies')
    .then(function () {
      t.fail('expected error');
    }).catch(function (err) {
      t.ok(/Lockfile not found at location.*/.test(err.toString()), 'expected error');
      t.end();
    });
});
