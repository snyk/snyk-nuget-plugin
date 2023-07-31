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
  const dir = path.join(os.tmpdir(), 'dotnet', 'publish');
  fs.mkdirSync(dir, { recursive: true });

  let tempFilePath;
  files.forEach((file) => {
    tempFilePath = path.join(dir, file.name);
    fs.writeFileSync(tempFilePath, file.contents);
  });

  return dir;
}

export function tearDown(dir: string) {
  if (!dir) {
    // No tempDir to tear down. Assuming the test failed somewhere.
    // Jest won't throw an error anyway if the operation fails.
    return;
  }

  fs.rmSync(dir, { recursive: true });
}
