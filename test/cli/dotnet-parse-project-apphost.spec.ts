import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as codeGenerator from '../../lib/nuget-parser/csharp/generator';
import * as nugetFrameworksParser from '../../lib/nuget-parser/csharp/nugetframeworks_parser';
import * as types from '../../lib/nuget-parser/types';

// Regression test for NU1101 "Unable to find package Microsoft.NETCore.App.Host.<rid>":
// SDK installs without the apphost pack cannot restore an Exe project from our offline
// source, so the probe must not require an apphost. We assert on the generated project
// (the pack is present on most dev machines, so a restore alone would not catch this)
// and check the probe still restores and runs.
describe('Parse.csproj apphost', () => {
  it('opts out of the apphost and still restores and runs', async () => {
    let projectDir: string | undefined;
    try {
      const sdkVersion = await dotnet.validate();
      projectDir = nugetFrameworksParser.generate(sdkVersion);

      const csproj = fs.readFileSync(
        path.join(projectDir, 'Parse.csproj'),
        'utf-8',
      );
      expect(csproj).toContain('<UseAppHost>false</UseAppHost>');

      await dotnet.restore(projectDir);
      const response = await dotnet.run(projectDir, ['net6.0']);
      const info: types.TargetFrameworkInfo = JSON.parse(response);
      expect(info.ShortName).toEqual('net6.0');
    } finally {
      if (projectDir) {
        codeGenerator.tearDown([projectDir]);
      }
    }
  });
});
