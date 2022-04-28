/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import type { Config, Filesystem } from '@angular/service-worker/config';
import * as crypto from 'crypto';
import { createReadStream, promises as fs, constants as fsConstants } from 'fs';
import * as path from 'path';
import { pipeline } from 'stream';
import { loadEsmModule } from './load-esm';

class CliFilesystem implements Filesystem {
  constructor(private base: string) {}

  list(dir: string): Promise<string[]> {
    return this._recursiveList(this._resolve(dir), []);
  }

  read(file: string): Promise<string> {
    return fs.readFile(this._resolve(file), 'utf-8');
  }

  hash(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1').setEncoding('hex');
      pipeline(createReadStream(this._resolve(file)), hash, (error) =>
        error ? reject(error) : resolve(hash.read()),
      );
    });
  }

  write(file: string, content: string): Promise<void> {
    return fs.writeFile(this._resolve(file), content);
  }

  private _resolve(file: string): string {
    return path.join(this.base, file);
  }

  private async _recursiveList(dir: string, items: string[]): Promise<string[]> {
    const subdirectories = [];
    for await (const entry of await fs.opendir(dir)) {
      if (entry.isFile()) {
        // Uses posix paths since the service worker expects URLs
        items.push('/' + path.relative(this.base, path.join(dir, entry.name)).replace(/\\/g, '/'));
      } else if (entry.isDirectory()) {
        subdirectories.push(path.join(dir, entry.name));
      }
    }

    for (const subdirectory of subdirectories) {
      await this._recursiveList(subdirectory, items);
    }

    return items;
  }
}

export async function augmentAppWithServiceWorker(
  appRoot: string,
  workspaceRoot: string,
  outputPath: string,
  baseHref: string,
  ngswConfigPath?: string,
): Promise<void> {
  // Determine the configuration file path
  const configPath = ngswConfigPath
    ? path.join(workspaceRoot, ngswConfigPath)
    : path.join(appRoot, 'ngsw-config.json');

  // Read the configuration file
  let config: Config | undefined;
  try {
    const configurationData = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(configurationData) as Config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Error: Expected to find an ngsw-config.json configuration file' +
          ` in the ${appRoot} folder. Either provide one or` +
          ' disable Service Worker in the angular.json configuration file.',
      );
    } else {
      throw error;
    }
  }

  // Load ESM `@angular/service-worker/config` using the TypeScript dynamic import workaround.
  // Once TypeScript provides support for keeping the dynamic import this workaround can be
  // changed to a direct dynamic import.
  const GeneratorConstructor = (
    await loadEsmModule<typeof import('@angular/service-worker/config')>(
      '@angular/service-worker/config',
    )
  ).Generator;

  // Generate the manifest
  const generator = new GeneratorConstructor(new CliFilesystem(outputPath), baseHref);
  const output = await generator.process(config);

  // Write the manifest
  const manifest = JSON.stringify(output, null, 2);
  await fs.writeFile(path.join(outputPath, 'ngsw.json'), manifest);

  // Find the service worker package
  const workerPath = require.resolve('@angular/service-worker/ngsw-worker.js');

  // Write the worker code
  await fs.copyFile(
    workerPath,
    path.join(outputPath, 'ngsw-worker.js'),
    fsConstants.COPYFILE_FICLONE,
  );

  // If present, write the safety worker code
  const safetyPath = path.join(path.dirname(workerPath), 'safety-worker.js');
  try {
    await fs.copyFile(
      safetyPath,
      path.join(outputPath, 'worker-basic.min.js'),
      fsConstants.COPYFILE_FICLONE,
    );
    await fs.copyFile(
      safetyPath,
      path.join(outputPath, 'safety-worker.js'),
      fsConstants.COPYFILE_FICLONE,
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}
