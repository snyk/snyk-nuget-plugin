import { describe, expect, it } from '@jest/globals';
import { parseSdkInfoFromDotnetOutput } from '../../lib/nuget-parser/runtime-assembly-v2';

describe('parseSdkInfoFromDotnetOutput', () => {
  it('parses SDK version and path when Host Version equals SDK version', () => {
    const infoOutput = `Host:
  Version:      8.0.24
  Architecture: arm64
  Commit:       a1b2c3d4e5
  RID:          linux-arm64

.NET SDKs installed:
  8.0.24 [/usr/share/dotnet/sdk]

.NET runtimes installed:
  Microsoft.AspNetCore.App 8.0.24 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]
  Microsoft.NETCore.App 8.0.24 [/usr/share/dotnet/shared/Microsoft.NETCore.App]
`;

    const result = parseSdkInfoFromDotnetOutput(infoOutput);

    expect(result).toEqual({
      sdkVersion: '8.0.24',
      sdkPath: '/usr/share/dotnet/sdk',
    });
  });

  it('parses SDK version and path when Host Version differs from SDK version', () => {
    const infoOutput = `Host:
  Version:      8.0.24
  Architecture: arm64
  Commit:       a1b2c3d4e5
  RID:          linux-arm64

.NET SDKs installed:
  8.0.418 [/usr/share/dotnet/sdk]

.NET runtimes installed:
  Microsoft.AspNetCore.App 8.0.24 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]
  Microsoft.NETCore.App 8.0.24 [/usr/share/dotnet/shared/Microsoft.NETCore.App]
`;

    const result = parseSdkInfoFromDotnetOutput(infoOutput);

    expect(result).toEqual({
      sdkVersion: '8.0.418',
      sdkPath: '/usr/share/dotnet/sdk',
    });
  });

  it('parses output with CRLF line endings', () => {
    const infoOutput =
      'Host:\r\n' +
      '  Version:      8.0.0\r\n' +
      '  Architecture: x64\r\n' +
      '  Commit:       a1b2c3d4e5\r\n' +
      '  RID:          win-x64\r\n' +
      '\r\n' +
      '.NET SDKs installed:\r\n' +
      '  8.0.0 [/usr/share/dotnet/sdk]\r\n' +
      '\r\n' +
      '.NET runtimes installed:\r\n' +
      '  Microsoft.NETCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\r\n';

    const result = parseSdkInfoFromDotnetOutput(infoOutput);

    expect(result).toEqual({
      sdkVersion: '8.0.0',
      sdkPath: '/usr/share/dotnet/sdk',
    });
  });

  it('returns version and path from first SDK line when multiple SDKs installed', () => {
    const infoOutput = `Host:
  Version:      9.0.0
  Architecture: arm64
  Commit:       a1b2c3d4e5
  RID:          linux-arm64

.NET SDKs installed:
  9.0.0 [/usr/share/dotnet/sdk]
  8.0.418 [/usr/share/dotnet/sdk]
  7.0.410 [/usr/share/dotnet/sdk]

.NET runtimes installed:
  Microsoft.NETCore.App 9.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]
  Microsoft.NETCore.App 8.0.24 [/usr/share/dotnet/shared/Microsoft.NETCore.App]
`;

    const result = parseSdkInfoFromDotnetOutput(infoOutput);

    expect(result).toEqual({
      sdkVersion: '9.0.0',
      sdkPath: '/usr/share/dotnet/sdk',
    });
  });

  it('parses SDK path with Windows-style path', () => {
    const infoOutput = `Host:
  Version:      8.0.0
  Architecture: x64
  Commit:       a1b2c3d4e5
  RID:          win-x64

.NET SDKs installed:
  8.0.0 [C:\\Program Files\\dotnet\\sdk]

.NET runtimes installed:
  Microsoft.NETCore.App 8.0.0 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]
`;

    const result = parseSdkInfoFromDotnetOutput(infoOutput);

    expect(result).toEqual({
      sdkVersion: '8.0.0',
      sdkPath: 'C:\\Program Files\\dotnet\\sdk',
    });
  });

  it('throws when output does not contain .NET SDKs installed section', () => {
    const infoOutput = `Host:
  Version:      8.0.0
  Architecture: x64

.NET runtimes installed:
  Microsoft.NETCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]
`;

    expect(() => parseSdkInfoFromDotnetOutput(infoOutput)).toThrow(
      'Could not fetch details about the dotnet SDK',
    );
  });
});
