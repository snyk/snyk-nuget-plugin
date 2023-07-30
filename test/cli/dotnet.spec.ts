import { describe, expect, it } from '@jest/globals';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as fs from 'fs';

describe('when running the dotnet cli command', () => {
  it('publishes correctly to a temporary folder', async () => {
    const filePath = './test/fixtures/dotnetcore/dotnet_6/';
    const publishDir = await dotnet.publish(filePath);
    const contents = fs.readdirSync(publishDir);
    expect(contents).toContain('dotnet_6.deps.json');
  });
});
