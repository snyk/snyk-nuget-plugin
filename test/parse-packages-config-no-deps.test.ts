import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';
const projectPath = './test/stubs/packages-config-no-deps/';

test('parse packages-config-no-deps project successfully', async (t) => {
  try {
    await plugin.inspect(projectPath, 'packages.config', {packagesFolder: projectPath + './_packages'});
    t.pass('parsed file correctly');
  } catch (e) {
      t.fail('failed parsing a project with no deps');
  }
});
