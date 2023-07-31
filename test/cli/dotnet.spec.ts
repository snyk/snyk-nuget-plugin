import { describe, expect, it } from '@jest/globals';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as fs from 'fs';

describe('when running the dotnet cli command', () => {
  it('publishes correctly to the /bin folder', async () => {
    const filePath = './test/fixtures/dotnetcore/dotnet_6_published/';
    const publishDir = await dotnet.publish(filePath);
    const contents = fs.readdirSync(publishDir);
    expect(contents).toContain('dotnet_6.deps.json');
  });
});
