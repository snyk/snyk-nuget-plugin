import { describe, expect, it } from '@jest/globals';
import * as plugin from '../lib/index';

describe('when parsing with unknown manifests', () => {
  it('Should throw error for unrecognized manifest file', async () => {
    expect(async () => await plugin.inspect(null, 'unknown.type')).toThrow(
      'Could not determine manifest type for unknown.type',
    );
  });

  it('Should throw error for unrecognized manifest file', async () => {
    try {
      await plugin.inspect(null, 'some.config');
    } catch (error: unknown) {
      expect(error.message).toBe(
        'Could not determine manifest type for some.config',
      );
    }
  });
});
