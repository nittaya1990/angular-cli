import { join } from 'path';
import { getGlobalVariable } from '../utils/env';
import { expectFileToExist, writeFile } from '../utils/fs';
import { gitClean } from '../utils/git';
import { setRegistry as setNPMConfigRegistry } from '../utils/packages';
import { ng, npm } from '../utils/process';
import { prepareProjectForE2e, updateJsonFile } from '../utils/project';

export default async function () {
  const argv = getGlobalVariable('argv');

  if (argv.noproject) {
    return;
  }

  if (argv.reuse) {
    process.chdir(argv.reuse);
    await gitClean();
  } else {
    const extraArgs = [];
    const testRegistry = getGlobalVariable('package-registry');
    const isCI = getGlobalVariable('ci');

    // Ensure local test registry is used when outside a project
    await setNPMConfigRegistry(true);

    await ng('new', 'test-project', '--skip-install', ...extraArgs);
    await expectFileToExist(join(process.cwd(), 'test-project'));
    process.chdir('./test-project');

    // If on CI, the user configuration set above will handle project usage
    if (!isCI) {
      // Ensure local test registry is used inside a project
      await writeFile('.npmrc', `registry=${testRegistry}`);
    }

    // Setup esbuild builder if requested on the commandline
    const useEsbuildBuilder = !!getGlobalVariable('argv')['esbuild'];
    if (useEsbuildBuilder) {
      await updateJsonFile('angular.json', (json) => {
        json['projects']['test-project']['architect']['build']['builder'] =
          '@angular-devkit/build-angular:browser-esbuild';
      });
    }
  }

  await prepareProjectForE2e('test-project');
  await ng('version');
}
