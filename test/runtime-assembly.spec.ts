import { describe, expect, it } from '@jest/globals';
import * as runtimeAssembly from '../lib/nuget-parser/runtime-assembly';

describe('when parsing runtime assembly', () => {
  it('publishes correctly to a temporary folder', async () => {
    const filePath =
      './test/fixtures/dotnetcore/dotnet_6/bin/Debug/net6.0/osx-arm64/publish/dotnet_6.deps.json';
    const runtimeAssemblies = await runtimeAssembly.generateRuntimeAssemblies(
      filePath,
    );

    expect(runtimeAssemblies).toMatchObject({
      'Microsoft.CSharp.dll': '6.0.0',
    });
  });
});
