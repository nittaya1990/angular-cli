/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { runWebpack } from '@angular-devkit/build-webpack';
import { tags } from '@angular-devkit/core';
import * as path from 'path';
import { Observable, from } from 'rxjs';
import { concatMap, map } from 'rxjs/operators';
import { ScriptTarget } from 'typescript';
import webpack from 'webpack';
import { ExecutionTransformer } from '../../transforms';
import { NormalizedBrowserBuilderSchema, deleteOutputDir } from '../../utils';
import { i18nInlineEmittedFiles } from '../../utils/i18n-inlining';
import { I18nOptions } from '../../utils/i18n-options';
import { ensureOutputPaths } from '../../utils/output-paths';
import { purgeStaleBuildCache } from '../../utils/purge-cache';
import { assertCompatibleAngularVersion } from '../../utils/version';
import { generateI18nBrowserWebpackConfigFromContext } from '../../utils/webpack-browser-config';
import { getCommonConfig, getStylesConfig } from '../../webpack/configs';
import { webpackStatsLogger } from '../../webpack/utils/stats';
import { Schema as ServerBuilderOptions } from './schema';

/**
 * @experimental Direct usage of this type is considered experimental.
 */
export type ServerBuilderOutput = BuilderOutput & {
  baseOutputPath: string;
  outputPaths: string[];
  /**
   * @deprecated in version 9. Use 'outputPaths' instead.
   */
  outputPath: string;
};

export { ServerBuilderOptions };

/**
 * @experimental Direct usage of this function is considered experimental.
 */
export function execute(
  options: ServerBuilderOptions,
  context: BuilderContext,
  transforms: {
    webpackConfiguration?: ExecutionTransformer<webpack.Configuration>;
  } = {},
): Observable<ServerBuilderOutput> {
  const root = context.workspaceRoot;

  // Check Angular version.
  assertCompatibleAngularVersion(root);

  const baseOutputPath = path.resolve(root, options.outputPath);
  let outputPaths: undefined | Map<string, string>;

  if (typeof options.bundleDependencies === 'string') {
    options.bundleDependencies = options.bundleDependencies === 'all';
    context.logger.warn(
      `Option 'bundleDependencies' string value is deprecated since version 9. Use a boolean value instead.`,
    );
  }

  if (!options.bundleDependencies) {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const { __processed_by_ivy_ngcc__, main = '' } = require('@angular/core/package.json');
    if (
      !__processed_by_ivy_ngcc__ ||
      !__processed_by_ivy_ngcc__.main ||
      (main as string).includes('__ivy_ngcc__')
    ) {
      context.logger.warn(tags.stripIndent`
      Warning: Turning off 'bundleDependencies' with Ivy may result in undefined behaviour
      unless 'node_modules' are transformed using the standalone Angular compatibility compiler (NGCC).
      See: https://angular.io/guide/ivy#ivy-and-universal-app-shell
    `);
    }
  }

  return from(initialize(options, context, transforms.webpackConfiguration)).pipe(
    concatMap(({ config, i18n, target }) => {
      return runWebpack(config, context, {
        webpackFactory: require('webpack') as typeof webpack,
        logging: (stats, config) => {
          if (options.verbose) {
            context.logger.info(stats.toString(config.stats));
          }
        },
      }).pipe(
        concatMap(async (output) => {
          const { emittedFiles = [], outputPath, webpackStats } = output;
          if (!webpackStats) {
            throw new Error('Webpack stats build result is required.');
          }

          let success = output.success;
          if (success && i18n.shouldInline) {
            outputPaths = ensureOutputPaths(baseOutputPath, i18n);

            success = await i18nInlineEmittedFiles(
              context,
              emittedFiles,
              i18n,
              baseOutputPath,
              Array.from(outputPaths.values()),
              [],
              outputPath,
              target <= ScriptTarget.ES5,
              options.i18nMissingTranslation,
            );
          }

          webpackStatsLogger(context.logger, webpackStats, config);

          return { ...output, success };
        }),
      );
    }),
    map((output) => {
      if (!output.success) {
        return output as ServerBuilderOutput;
      }

      return {
        ...output,
        baseOutputPath,
        outputPath: baseOutputPath,
        outputPaths: outputPaths || [baseOutputPath],
      } as ServerBuilderOutput;
    }),
  );
}

export default createBuilder<ServerBuilderOptions, ServerBuilderOutput>(execute);

async function initialize(
  options: ServerBuilderOptions,
  context: BuilderContext,
  webpackConfigurationTransform?: ExecutionTransformer<webpack.Configuration>,
): Promise<{
  config: webpack.Configuration;
  i18n: I18nOptions;
  target: ScriptTarget;
}> {
  // Purge old build disk cache.
  await purgeStaleBuildCache(context);

  const originalOutputPath = options.outputPath;
  const { config, i18n, target } = await generateI18nBrowserWebpackConfigFromContext(
    {
      ...options,
      buildOptimizer: false,
      aot: true,
      platform: 'server',
    } as NormalizedBrowserBuilderSchema,
    context,
    (wco) => [getCommonConfig(wco), getStylesConfig(wco)],
  );

  let transformedConfig;
  if (webpackConfigurationTransform) {
    transformedConfig = await webpackConfigurationTransform(config);
  }

  if (options.deleteOutputPath) {
    deleteOutputDir(context.workspaceRoot, originalOutputPath);
  }

  return { config: transformedConfig || config, i18n, target };
}
