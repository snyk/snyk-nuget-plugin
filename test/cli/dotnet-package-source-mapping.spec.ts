import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as dotnet from '../../lib/nuget-parser/cli/dotnet';
import * as codeGenerator from '../../lib/nuget-parser/csharp/generator';
import * as nugetFrameworksParser from '../../lib/nuget-parser/csharp/nugetframeworks_parser';
import * as types from '../../lib/nuget-parser/types';

// Regression test for a client-reported NU1100: their global NuGet.Config had
// PackageSourceMapping enabled, which excluded our bundled offline source
// (unknown to their config) from consideration for every package, including
// the NuGet.Frameworks helper package this module restores for TFM parsing.
describe('offline restore against a client machine with PackageSourceMapping enabled globally', () => {
  it('still restores the bundled NuGet.Frameworks package when the user-level NuGet.Config maps every package to an unrelated source', async () => {
    // Arrange: emulate a client global NuGet.Config that maps every package to
    // "nuget.org" only - a source our offline nuget.config never declares.
    const fakeUserProfileDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'snyk-nuget-plugin-test-fake-user-profile-'),
    );
    const hostileNugetConfig = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
  </packageSourceMapping>
</configuration>
`;
    // Linux/macOS user-level config location.
    fs.mkdirSync(path.join(fakeUserProfileDir, '.nuget', 'NuGet'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(fakeUserProfileDir, '.nuget', 'NuGet', 'NuGet.Config'),
      hostileNugetConfig,
    );
    // Windows user-level config location.
    fs.mkdirSync(path.join(fakeUserProfileDir, 'NuGet'), { recursive: true });
    fs.writeFileSync(
      path.join(fakeUserProfileDir, 'NuGet', 'NuGet.Config'),
      hostileNugetConfig,
    );

    const originalEnv: Record<string, string | undefined> = {
      HOME: process.env.HOME,
      APPDATA: process.env.APPDATA,
    };
    process.env.HOME = fakeUserProfileDir;
    process.env.APPDATA = fakeUserProfileDir;

    let projectDir: string | undefined;
    try {
      // Act
      const sdkVersion = await dotnet.validate();
      projectDir = nugetFrameworksParser.generate(sdkVersion);

      const nugetConfig = fs.readFileSync(
        path.join(projectDir, 'nuget.config'),
        'utf-8',
      );
      expect(nugetConfig).toContain('<packageSourceMapping>');

      await dotnet.restore(projectDir);
      const response = await dotnet.run(projectDir, ['net6.0']);
      const targetFrameworkInfo: types.TargetFrameworkInfo =
        JSON.parse(response);

      // Assert
      expect(targetFrameworkInfo.ShortName).toEqual('net6.0');
    } finally {
      for (const key of Object.keys(originalEnv)) {
        if (originalEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalEnv[key];
        }
      }
      fs.rmSync(fakeUserProfileDir, { recursive: true, force: true });
      if (projectDir) {
        codeGenerator.tearDown([projectDir]);
      }
    }
  });
});
