import { TargetFramework } from "./types";

export function toReadableFramework(targetFramework: string): TargetFramework | undefined {
  const typeMapping = {
    net: '.NETFramework',
    netcoreapp: '.NETCore',
    netstandard: '.NETStandard',
    v: '.NETFramework',
  };

  for (const type in typeMapping) {
    if (new RegExp(type + /\d.?\d(.?\d)?$/.source).test(targetFramework)) {
      return {
        framework: typeMapping[type],
        original: targetFramework,
        version: targetFramework.split(type)[1],
      };
    }
  }

  return undefined;
}
  