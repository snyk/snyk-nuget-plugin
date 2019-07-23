import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';

const stubsDir = './test/stubs';
const simplePaket = stubsDir + '/simple-paket/';
const missingLock = stubsDir + '/paket-missing-lock/';

const simplePaketDeps = {
  'FAKE': {
    depType: 'prod',
    dependencies: {},
    name: 'FAKE',
    version: '5.8.4',
  },
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
};

test('parse simple-paket project', async (t) => {
  try {
    const tree = await plugin.inspect(simplePaket, 'paket.dependencies');
    t.deepEquals(tree.package.dependencies, simplePaketDeps, 'expected dependencies');
    t.equals(tree.package.name, 'simple-paket', 'correct name');
  } catch(err) {
    t.fail('did not expect error' + err);
  }
});

test('parse simple-paket project from upper dir', async (t) => {
  try {
    const tree = await plugin.inspect(stubsDir, 'simple-paket/paket.dependencies');
    t.deepEquals(tree.package.dependencies, simplePaketDeps, 'expected dependencies');
    t.equals(tree.package.name, 'simple-paket', 'correct name');
  } catch(err) {
    t.fail('did not expect error ' + err);
  }
});

test('fail to parse paket with missing lock file project', async (t) => {
  try {
    await plugin.inspect(missingLock, 'paket.dependencies');
    t.fail('expected error');
  } catch(err) {
    t.ok(/Lockfile not found at location.*/.test(err.toString()), 'expected error');
  }
});
