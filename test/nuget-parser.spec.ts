import { describe, expect, it } from '@jest/globals';
import { getMinimumTargetFrameworkFromPackagesConfig } from '../lib/nuget-parser';

describe('when calling getMinimumTargetFrameworkFromPackagesConfig', () => {
  it.each([
    // give bad content and expect to throw
    '<hello></bye>',
  ])('should throw', async content => {
    await expect(
      async () => await getMinimumTargetFrameworkFromPackagesConfig(content),
    ).rejects.toThrow();
  });

  it.each([
    // give empty content and expect undefined
    '',
    // give no packages but don't expect to throw
    '<?xml version="1.0" encoding="utf-8"?>',
    // give empty packages but don't expect to throw
    `<?xml version="1.0" encoding="utf-8"?>
<packages>
</packages>`,
    // give a file with no targetFramework in the dependencies and expect undefined
    `<?xml version="1.0" encoding="utf-8"?>
<packages>
<package id="jQuery" version="3.2.1" />
</packages>`,
  ])('should NOT throw', async content => {
    const result = await getMinimumTargetFrameworkFromPackagesConfig(content);
    await expect(result).toBeUndefined();
  });
});
