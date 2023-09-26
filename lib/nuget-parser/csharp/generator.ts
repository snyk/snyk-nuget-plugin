import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as types from '../types';

// Importing .NET code from Typescript is not trivial and a bit lose cannon programming. However, we also want to keep
// this project dependent on as few packages as possible, so instead of opting into some "run .NET in Typescript" package,
// we do the simplest, which is this. Makes C# debugging a bit harder, but it's a compromise.
// Further, we also utilize this for our test fixtures. Running tests in parallel can cause race conditions for fixtures
// at-rest, if two tests are `dotnet publish`'ing to the same fixture folder. So we supply a generator for populating
// fixtures in temporary folders to keep the test stateless while ensuring parallelization.
export function generate(
  tempDirNameSpace: string,
  files: types.DotNetFile[],
): string {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `snyk-nuget-plugin-test-${tempDirNameSpace}-`),
  );

  let tempFilePath: string;
  files.forEach((file) => {
    tempFilePath = path.join(tempDir, file.name);
    fs.writeFileSync(tempFilePath, file.contents);
  });

  return tempDir;
}

export function tearDown(dirs: string[]) {
  for (const dir of dirs) {
    if (!dir) {
      // No tempDir to tear down. Assuming the test failed somewhere.
      // Jest won't throw an error anyway if the operation fails.
      return;
    }

    try {
      fs.rmSync(dir, { recursive: true });
    } catch (error: unknown) {
      // Ignore it, test was tearing down anyway, and it seems Windows boxes especially don't like this.
    }
  }
}
