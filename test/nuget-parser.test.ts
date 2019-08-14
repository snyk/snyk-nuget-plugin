import * as tap from 'tap';
const test = tap.test;
import { getMinimumTargetFrameworkFromPackagesConfig } from '../lib/nuget-parser';

test('various error handling is performed for getMinimumTargetFrameworkFromPackagesConfig', async (t) => {
  // give bad content and expect to throw
  const malformedXml = '<hello></bye>';
  try {
    await getMinimumTargetFrameworkFromPackagesConfig(malformedXml);
    t.fail('expected to throw on malformed xml');
  } catch (error) {
    t.pass('expected to throw on malformed xml');
  }
  
  // give empty content and expect undefined
  try {
    const result = await getMinimumTargetFrameworkFromPackagesConfig('');
    t.pass('expected not to throw on empty content');
    t.deepEqual(result, undefined, 'should return undefined on empty content');
  } catch (error) {
    t.fail('expected not to throw on empty content');
  }

  // give no packages but don't expect to throw
  const noPackages = `
    <?xml version="1.0" encoding="utf-8"?> 
  `;
  try {
    const result = await getMinimumTargetFrameworkFromPackagesConfig(noPackages);
    t.pass('expected not to throw on missing packages element in the xml');
    t.deepEqual(result, undefined, 'should return undefined on missing packages element');
  } catch (error) {
    t.fail('expected not to throw on missing packages element in the xml')
  }

  // give empty packages but don't expect to throw
  const emptyPackages = `
    <?xml version="1.0" encoding="utf-8"?>
    <packages>
    </packages>
  `;
  try {
    const result = await getMinimumTargetFrameworkFromPackagesConfig(emptyPackages);
    t.pass('expected not to throw on empty packages element in the xml');
    t.deepEqual(result, undefined, 'should return undefined on empty packages element');
  } catch (error) {
    t.fail('expected not to throw on empty packages element in the xml');
  }

  // give a file with no targetFramework in the dependencies and expect undefined
  const emptyTargetFramework = `
    <?xml version="1.0" encoding="utf-8"?>
    <packages>
      <package id="jQuery" version="3.2.1" />
    </packages>  
  `;
  try {
    const shouldBeUndefined = await getMinimumTargetFrameworkFromPackagesConfig(emptyTargetFramework);
    t.pass('expected not to throw on missing targetFramework');
    t.equal(shouldBeUndefined, undefined, 'should return undefined on missing targetFramework');
  } catch (error) {
    t.fail('expected not to throw on missing targetFramework');
  }
});
