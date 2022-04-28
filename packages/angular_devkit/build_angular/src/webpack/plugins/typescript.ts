/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import type { CompilerOptions } from '@angular/compiler-cli';
import { AngularWebpackPlugin } from '@ngtools/webpack';
import { ScriptTarget } from 'typescript';
import { WebpackConfigOptions } from '../../utils/build-options';

function ensureIvy(wco: WebpackConfigOptions): void {
  if (wco.tsConfig.options.enableIvy !== false) {
    return;
  }

  wco.logger.warn(
    'Project is attempting to disable the Ivy compiler. ' +
      'Angular versions 12 and higher do not support the deprecated View Engine compiler for applications. ' +
      'The Ivy compiler will be used to build this project. ' +
      '\nFor additional information or if the build fails, please see https://angular.io/guide/ivy',
  );

  wco.tsConfig.options.enableIvy = true;
}

export function createIvyPlugin(
  wco: WebpackConfigOptions,
  aot: boolean,
  tsconfig: string,
): AngularWebpackPlugin {
  if (aot) {
    ensureIvy(wco);
  }

  const { buildOptions } = wco;
  const optimize = buildOptions.optimization.scripts;

  const compilerOptions: CompilerOptions = {
    sourceMap: buildOptions.sourceMap.scripts,
    declaration: false,
    declarationMap: false,
  };

  if (buildOptions.preserveSymlinks !== undefined) {
    compilerOptions.preserveSymlinks = buildOptions.preserveSymlinks;
  }

  // Outputting ES2015 from TypeScript is the required minimum for the build optimizer passes.
  // Downleveling to ES5 will occur after the build optimizer passes via babel which is the same
  // as for third-party libraries. This greatly reduces the complexity of static analysis.
  if (wco.scriptTarget < ScriptTarget.ES2015) {
    compilerOptions.target = ScriptTarget.ES2015;
  }

  const fileReplacements: Record<string, string> = {};
  if (buildOptions.fileReplacements) {
    for (const replacement of buildOptions.fileReplacements) {
      fileReplacements[replacement.replace] = replacement.with;
    }
  }

  let inlineStyleFileExtension;
  switch (buildOptions.inlineStyleLanguage) {
    case 'less':
      inlineStyleFileExtension = 'less';
      break;
    case 'sass':
      inlineStyleFileExtension = 'sass';
      break;
    case 'scss':
      inlineStyleFileExtension = 'scss';
      break;
    case 'css':
    default:
      inlineStyleFileExtension = 'css';
      break;
  }

  return new AngularWebpackPlugin({
    tsconfig,
    compilerOptions,
    fileReplacements,
    jitMode: !aot,
    emitNgModuleScope: !optimize,
    inlineStyleFileExtension,
  });
}
