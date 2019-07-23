import * as tap from 'tap';
const test = tap.test;
import * as plugin from '../lib/index';

test('Should throw error for unrecognized manifest file', async (t) => {
  try {
  await plugin.inspect(null, 'unknown.type');
  } catch (err) {
    t.equal(err.message, 'Could not determine manifest type for unknown.type');
  }
});

test('Should throw error for unrecognized manifest file', async (t) => {
  try {
    await plugin.inspect(null, 'some.config');
  } catch (err) {
    t.equal(err.message, 'Could not determine manifest type for some.config');
  }
});
