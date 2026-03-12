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

  it('parses SDK version and path when Host Version differs from SDK version (current regex fails until fixed)', () => {
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
});
