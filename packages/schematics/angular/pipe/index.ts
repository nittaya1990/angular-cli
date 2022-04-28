/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  Rule,
  SchematicsException,
  Tree,
  apply,
  applyTemplates,
  chain,
  filter,
  mergeWith,
  move,
  noop,
  strings,
  url,
} from '@angular-devkit/schematics';
import * as ts from '../third_party/github.com/Microsoft/TypeScript/lib/typescript';
import { addDeclarationToModule, addExportToModule } from '../utility/ast-utils';
import { InsertChange } from '../utility/change';
import { buildRelativePath, findModuleFromOptions } from '../utility/find-module';
import { parseName } from '../utility/parse-name';
import { createDefaultPath } from '../utility/workspace';
import { Schema as PipeOptions } from './schema';

function addDeclarationToNgModule(options: PipeOptions): Rule {
  return (host: Tree) => {
    if (options.skipImport || options.standalone || !options.module) {
      return host;
    }

    const modulePath = options.module;
    const sourceText = host.readText(modulePath);
    const source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);

    const pipePath =
      `/${options.path}/` +
      (options.flat ? '' : strings.dasherize(options.name) + '/') +
      strings.dasherize(options.name) +
      '.pipe';
    const relativePath = buildRelativePath(modulePath, pipePath);
    const changes = addDeclarationToModule(
      source,
      modulePath,
      strings.classify(`${options.name}Pipe`),
      relativePath,
    );
    const recorder = host.beginUpdate(modulePath);
    for (const change of changes) {
      if (change instanceof InsertChange) {
        recorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(recorder);

    if (options.export) {
      const sourceText = host.readText(modulePath);
      const source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);

      const exportRecorder = host.beginUpdate(modulePath);
      const exportChanges = addExportToModule(
        source,
        modulePath,
        strings.classify(`${options.name}Pipe`),
        relativePath,
      );

      for (const change of exportChanges) {
        if (change instanceof InsertChange) {
          exportRecorder.insertLeft(change.pos, change.toAdd);
        }
      }
      host.commitUpdate(exportRecorder);
    }

    return host;
  };
}

export default function (options: PipeOptions): Rule {
  return async (host: Tree) => {
    if (options.path === undefined) {
      options.path = await createDefaultPath(host, options.project as string);
    }

    options.module = findModuleFromOptions(host, options);

    const parsedPath = parseName(options.path, options.name);
    options.name = parsedPath.name;
    options.path = parsedPath.path;

    const templateSource = apply(url('./files'), [
      options.skipTests ? filter((path) => !path.endsWith('.spec.ts.template')) : noop(),
      applyTemplates({
        ...strings,
        'if-flat': (s: string) => (options.flat ? '' : s),
        ...options,
      }),
      move(parsedPath.path),
    ]);

    return chain([addDeclarationToNgModule(options), mergeWith(templateSource)]);
  };
}
