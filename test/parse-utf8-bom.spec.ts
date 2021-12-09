import * as path from 'path';
import * as fs from 'fs';
import { _parsedNuspec } from '../lib/nuget-parser/nuspec-parser';

it('should create dep tree for package encoded with utf8 with bom', async () => {
  const nuspecContent = fs.readFileSync(
    path.resolve('./test/stubs/utf8-bom-nuspec/NUnit.nuspec'),
    'utf-8',
  );
  // prepending BOM unicode character
  const nuspecContentWithBom = '\ufeff' + nuspecContent;

  const depTree = await _parsedNuspec(
    nuspecContentWithBom,
    {
      framework: '.NETFramework',
      original: 'v4.6.1',
      version: '4.6.1',
    },
    'NUnit',
  );

  expect(depTree).toEqual({
    children: [],
    name: 'NUnit',
  });
});
