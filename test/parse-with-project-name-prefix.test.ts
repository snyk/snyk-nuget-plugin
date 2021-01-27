import * as tap from "tap";
const test = tap.test;
import * as plugin from "../lib/index";

const projects = {
  csproj: {
    projectPath: "test/stubs/target_framework/no_csproj",
    manifestFile: "obj/project.assets.json",
    defaultName: "no_csproj",
  },
  packagesConfig: {
    projectPath: "test/stubs/packages-config-only",
    manifestFile: "packages.config",
    defaultName: "packages-config-only",
  },
};

for (const project in projects) {
  const proj = projects[project];
  test(`inspect ${project} with project-name-prefix option`, async (t) => {
    const res = await plugin.inspect(proj.projectPath, proj.manifestFile, {
      "project-name-prefix": "custom-prefix/",
    });
    t.equal(
      res.package.name,
      `custom-prefix/${proj.defaultName}`,
      "expected name to be prefixed with value passed in via options"
    );
  });

  test(`inspect ${project} without project-name-prefix option`, async (t) => {
    const res = await plugin.inspect(proj.projectPath, proj.manifestFile, {});
    t.equal(res.package.name, proj.defaultName, "expected default name");
  });
}
