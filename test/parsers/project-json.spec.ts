import { describe, expect, it } from '@jest/globals';
import * as plugin from '../../lib';
import * as path from 'path';
import * as fs from 'fs';

const projectJsonDir = './test/fixtures/project-json';

describe('when testing a project.json file', () => {
  it('returns the expected dependency tree', async () => {
    const expected = JSON.parse(
      fs
        .readFileSync(path.resolve(projectJsonDir, 'expected.json'))
        .toString('utf-8'),
    );

    const tree = await plugin.inspect(projectJsonDir, 'project.json');
    expect(tree.package.dependencies).toEqual(expected);
    expect(tree.package.name).toBe('project-json');
  });
});
