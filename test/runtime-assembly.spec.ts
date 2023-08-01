import { describe, expect, it } from '@jest/globals';
import * as runtimeAssembly from '../lib/nuget-parser/runtime-assembly';

describe('when parsing runtime assembly', () => {
  it('correctly matches the assembly versions of system dependencies', async () => {
    const filePath =
      './test/fixtures/dotnetcore/dotnet_6_deps/dotnet_6.deps.json';
    const runtimeAssemblies = await runtimeAssembly.generateRuntimeAssemblies(
      filePath,
    );

    expect(runtimeAssemblies).toMatchObject({
      'Microsoft.CSharp.dll': '6.0.0',
    });
  });
});
