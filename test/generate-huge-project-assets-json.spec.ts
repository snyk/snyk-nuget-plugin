import * as _ from 'lodash';

interface TargetDetail {
    name: string, // AclService.Interface/1.6.0.410
    type: string, // "package"
    dependencies: string[], // "Dependency.Common.Contracts": "[2.14.9.612]"
    compile: string[], //  "lib/netstandard2.0/AclService.Interface.dll": {}
    runtime: string[] // "lib/netstandard2.0/AclService.Interface.dll": {}
}

interface Target {
    targetName: string, // ".NETFramework,Version=v4.7.2"
    targetDetails: TargetDetail[]
}

interface TargetList {
    target: Target[]
}

interface LibraryDetail {
    sha512: string, //"wa8f1Lkn1K8YNzLxnCE99wihnLjhL7Z6VxuZooSnJqjPoxyG3cAnxJG14oNNUbHEfNHIkY1XpW2DGA4ECINSdQ==",
    type: string, // "package"
    path: string, // "aclservice.interface/1.6.0.410",
    files: string [] // ".nupkg.metadata", "aclservice.interface.1.6.0.410.nupkg.sha512", "aclservice.interface.nuspec", ...
}

interface Library {
    name: string, // AclService.Interface/1.6.0.410
    details: LibraryDetail[]
}

interface LibraryList {
    library: Library[], // AclService.Interface/1.6.0.410
}

interface ProjectFileDependencyGroup{
    name: string, // .NETFramework,Version=v4.7.2
    files: string[] // "Apache.Avro >= 1.10.2", "Castle.Core >= 4.4.1","Confluent.Kafka >= 1.3.0", ...
}

interface ProjectFileDependencyGroupList {
    group: ProjectFileDependencyGroup[]
}

interface ProjectAssets {
    version: number,
    targets: TargetList,
    libraries: LibraryList,
}

const targetsNum = 600;
const targetDetailsNum = 100;
const targetDetailArrays = 100;
function createTargetList(): TargetList {
    // create targetDetail arrays: dependencies, compile, runtime
    const dependencies = [] as string[];
    const compile = [] as string[];
    const runtime = [] as string[];
    for (let arrayVersion = 1; arrayVersion <= targetDetailArrays; arrayVersion++){
        dependencies.push(`Dependency.Common.Contracts": "[${arrayVersion}]`);
        compile.push(`lib/netstandard2.0/AclService.Interface.dll": {${arrayVersion}}`);
        runtime.push(`lib/netstandard2.0/AclService.Interface.dll": {${arrayVersion}}`);
    }

    const targetDetails: TargetDetail[] = [];
    for (let targetDetailVersion = 1; targetDetailVersion <= targetDetailsNum; targetDetailVersion++){
        const targetDetail = {
            name: `AclService.Interface/${targetDetailVersion}`,
            type: "package",
            dependencies: dependencies,
            compile: compile,
            runtime: runtime
        } as TargetDetail;
        targetDetails.push(targetDetail)
    }

    const targets = [] as Target[];
    // create targets
    for(let targetVersion = 1; targetVersion <= targetsNum; targetVersion++) {
        const target = {
            targetName: `.NETFramework,Version=v${targetVersion}`,
            targetDetails: targetDetails
        } as Target;
        targets.push(target);
    }
    const targetList = {
        target: targets
    } as TargetList;
    return targetList;
}

const librariesNum =400;
const libraryDetailsNum = 100;
const libraryDetailArrays = 100;
function createLibraryList(): LibraryList {
    // create libraryDetail array: files
    const files = [] as string[];
    const runtime = [] as string[];
    for (let arrayVersion = 1; arrayVersion <= libraryDetailArrays; arrayVersion++){
        runtime.push(`aclservice.interface.${arrayVersion}.0.410.nupkg.sha512`);
    }

    const libraryDetails: LibraryDetail[] = [];
    for (let targetDetailVersion = 1; targetDetailVersion <= libraryDetailsNum; targetDetailVersion++){
        const libraryDetail = {
            sha512: `wa8f1Lkn1K8YNzLxnCE99wihnLjhL7Z6VxuZooSnJqjPoxyG3cAnxJG14oNNUbHEfNHIkY1XpW2DGA4ECINSdQ==`,
            type: "package",
            path: `aclservice.interface/1.6.0.410`,
            files: files,
        } as LibraryDetail;
        libraryDetails.push(libraryDetail)
    }

    const libraries = [] as Library[];
    // create targets
    for(let libraryVersion = 1; libraryVersion <= librariesNum; libraryVersion++) {
        const library = {
            name: `AclService.Interface/${libraryVersion}`,
            details: libraryDetails
        } as Library;
        libraries.push(library);
    }
    const libraryList = {
        library: libraries
    } as LibraryList;
    return libraryList;
}

function createHugeProjectAssets(): ProjectAssets {
    const targets = createTargetList();
    const libraries = createLibraryList();
    const projectAssets = {
        version: 3,
        targets: targets,
        libraries: libraries,
    } as ProjectAssets;
    return projectAssets;
}

describe('parse-large-dependency-tree', () => {
    it('parse-large-dependency-tree', async() => {
        const projectAssets = createHugeProjectAssets();
        const newProjectAssets = _.cloneDeep(projectAssets);
        expect(newProjectAssets.targets.target.length).toBe(600);
        expect(newProjectAssets.libraries.library.length).toBe(400);

        // convert the graph object to JSON
        // this will fail and throw RangeError: Invalid string length
        try{
            JSON.stringify(projectAssets);
        }catch(err){
            console.log(err);
            expect(err.message).toBe('Invalid string length');
        }
    });
});