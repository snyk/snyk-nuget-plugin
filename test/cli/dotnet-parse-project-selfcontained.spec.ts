import { describe, it, expect } from '@jest/globals';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as codeGenerator from '../../lib/nuget-parser/csharp/generator';
import * as nugetFrameworksParser from '../../lib/nuget-parser/csharp/nugetframeworks_parser';
import * as types from '../../lib/nuget-parser/types';

// Regression test for NETSDK1067 "Self-contained applications are required to use the
// application host": the probe opts out of the apphost, so an ambient SelfContained=true
// (env var or CI pipeline variable) fails both restore and run unless we override it.
describe('Parse.csproj with ambient SelfContained=true', () => {
  it('still restores and runs', async () => {
    let projectDir: string | undefined;
    const previous = process.env.SelfContained;
    process.env.SelfContained = 'true';
    try {
      const sdkVersion = await dotnet.validate();
      projectDir = nugetFrameworksParser.generate(sdkVersion);

      await dotnet.restore(projectDir);
      const response = await dotnet.run(projectDir, ['net6.0']);
      const info: types.TargetFrameworkInfo = JSON.parse(response);
      expect(info.ShortName).toEqual('net6.0');
    } finally {
      if (previous === undefined) {
        delete process.env.SelfContained;
      } else {
        process.env.SelfContained = previous;
      }
      if (projectDir) {
        codeGenerator.tearDown([projectDir]);
      }
    }
  });
});
