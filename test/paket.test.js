var test = require('tap').test;
var plugin = require('../lib/index');
var path = require('path');

var simplePaket = './test/stubs/simple-paket/';

var simplePaketDeps = {
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
      t.equals(tree.package.name, path.resolve(simplePaket, 'paket.dependencies'), 'correct name');
      t.end();
    });
});
