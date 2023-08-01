import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface File {
  name: string;
  contents: string;
}

// Running tests in parallel can cause race conditions for fixtures at-rest, if two tests are `dotnet publish`'ing
// to the same fixture folder. So we supply a generator for populating fixtures in temporary folders to keep the test
// stateless while ensuring parallelization.
export function setup(files: File[]): string {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dotnet-test-publish-'),
  );

  let tempFilePath;
  files.forEach((file) => {
    tempFilePath = path.join(tempDir, file.name);
    fs.writeFileSync(tempFilePath, file.contents);
  });

  return tempDir;
}

export function tearDown(dir: string) {
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
