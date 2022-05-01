import { fromFolderName } from '../lib/nuget-parser/dependency';
import { InvalidFolderFormatError } from '../lib/errors/invalid-folder-format-error';

describe('fromFolderName() method', () => {
  it('should properly fail when parsing folder without expectedVersion', () => {
    expect(() =>
      fromFolderName('someLibraryNameWithoutexpectedVersion'),
    ).toThrow(InvalidFolderFormatError);
  });

  //sanity check
  it.each([
    ['RestSharp.105.2.3', '105.2.3'],
    ['FooBar.1.2', '1.2'],
    ['FooBar1.2', '2'],
  ])("should correctly parse '%s'", (folder, expectedVersion) => {
    const result = fromFolderName(folder);
    expect(result).toBeTruthy();
    expect(result.version).toBe(expectedVersion);
  });
});
