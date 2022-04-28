// This may seem awkward but we're using Logger in our e2e. At this point the unit tests
// have run already so it should be "safe", teehee.
import { logging } from '@angular-devkit/core';
import { createConsoleLogger } from '@angular-devkit/core/node';
import * as colors from 'ansi-colors';
import glob from 'glob';
import yargsParser from 'yargs-parser';
import * as path from 'path';
import { setGlobalVariable } from './e2e/utils/env';
import { gitClean } from './e2e/utils/git';
import { createNpmRegistry } from './e2e/utils/registry';

Error.stackTraceLimit = Infinity;

// tslint:disable:no-global-tslint-disable no-console

/**
 * Here's a short description of those flags:
 *   --debug          If a test fails, block the thread so the temporary directory isn't deleted.
 *   --noproject      Skip creating a project or using one.
 *   --nobuild        Skip building the packages. Use with --noglobal and --reuse to quickly
 *                    rerun tests.
 *   --noglobal       Skip linking your local @angular/cli directory. Can save a few seconds.
 *   --nosilent       Never silence ng commands.
 *   --ng-tag=TAG     Use a specific tag for build snapshots. Similar to ng-snapshots but point to a
 *                    tag instead of using the latest master.
 *   --ng-snapshots   Install angular snapshot builds in the test project.
 *   --glob           Run tests matching this glob pattern (relative to tests/e2e/).
 *   --ignore         Ignore tests matching this glob pattern.
 *   --reuse=/path    Use a path instead of create a new project. That project should have been
 *                    created, and npm installed. Ideally you want a project created by a previous
 *                    run of e2e.
 *   --nb-shards      Total number of shards that this is part of. Default is 2 if --shard is
 *                    passed in.
 *   --shard          Index of this processes' shard.
 *   --devkit=path    Path to the devkit to use. The devkit will be built prior to running.
 *   --tmpdir=path    Override temporary directory to use for new projects.
 * If unnamed flags are passed in, the list of tests will be filtered to include only those passed.
 */
const argv = yargsParser(process.argv.slice(2), {
  boolean: ['debug', 'esbuild', 'ng-snapshots', 'noglobal', 'nosilent', 'noproject', 'verbose'],
  string: ['devkit', 'glob', 'ignore', 'reuse', 'ng-tag', 'tmpdir', 'ng-version'],
  configuration: {
    'dot-notation': false,
    'camel-case-expansion': false,
  },
});

/**
 * Set the error code of the process to 255.  This is to ensure that if something forces node
 * to exit without finishing properly, the error code will be 255. Right now that code is not used.
 *
 * - 1 When tests succeed we already call `process.exit(0)`, so this doesn't change any correct
 * behaviour.
 *
 * One such case that would force node <= v6 to exit with code 0, is a Promise that doesn't resolve.
 */
process.exitCode = 255;

const logger = createConsoleLogger(argv.verbose, process.stdout, process.stderr, {
  info: (s) => s,
  debug: (s) => s,
  warn: (s) => colors.bold.yellow(s),
  error: (s) => colors.bold.red(s),
  fatal: (s) => colors.bold.red(s),
});

const logStack = [logger];
function lastLogger() {
  return logStack[logStack.length - 1];
}

const testGlob = argv.glob || 'tests/**/*.ts';
let currentFileName = null;

const e2eRoot = path.join(__dirname, 'e2e');
const allSetups = glob.sync('setup/**/*.ts', { nodir: true, cwd: e2eRoot }).sort();
const allTests = glob
  .sync(testGlob, { nodir: true, cwd: e2eRoot, ignore: argv.ignore })
  // Replace windows slashes.
  .map((name) => name.replace(/\\/g, '/'))
  .sort()
  .filter((name) => !name.endsWith('/setup.ts'));

const shardId = 'shard' in argv ? argv['shard'] : null;
const nbShards = (shardId === null ? 1 : argv['nb-shards']) || 2;
const tests = allTests.filter((name) => {
  // Check for naming tests on command line.
  if (argv._.length == 0) {
    return true;
  }

  return argv._.some((argName) => {
    return (
      path.join(process.cwd(), argName + '') == path.join(__dirname, 'e2e', name) ||
      argName == name ||
      argName == name.replace(/\.ts$/, '')
    );
  });
});

// Remove tests that are not part of this shard.
const shardedTests = tests.filter((name, i) => shardId === null || i % nbShards == shardId);
const testsToRun = allSetups.concat(shardedTests);

if (shardedTests.length === 0) {
  console.log(`No tests would be ran, aborting.`);
  process.exit(1);
}

console.log(testsToRun.join('\n'));
/**
 * Load all the files from the e2e, filter and sort them and build a promise of their default
 * export.
 */
if (testsToRun.length == allTests.length) {
  console.log(`Running ${testsToRun.length} tests`);
} else {
  console.log(`Running ${testsToRun.length} tests (${allTests.length + allSetups.length} total)`);
}

setGlobalVariable('argv', argv);
setGlobalVariable('ci', process.env['CI']?.toLowerCase() === 'true' || process.env['CI'] === '1');
setGlobalVariable('package-manager', argv.yarn ? 'yarn' : 'npm');
setGlobalVariable('package-registry', 'http://localhost:4873');

const registryProcess = createNpmRegistry();
const secureRegistryProcess = createNpmRegistry(true);

testsToRun
  .reduce((previous, relativeName, testIndex) => {
    // Make sure this is a windows compatible path.
    let absoluteName = path.join(e2eRoot, relativeName);
    if (/^win/.test(process.platform)) {
      absoluteName = absoluteName.replace(/\\/g, path.posix.sep);
    }

    return previous.then(() => {
      currentFileName = relativeName.replace(/\.ts$/, '');
      const start = +new Date();

      const module = require(absoluteName);
      const originalEnvVariables = {
        ...process.env,
      };

      const fn: (skipClean?: () => void) => Promise<void> | void =
        typeof module == 'function'
          ? module
          : typeof module.default == 'function'
          ? module.default
          : () => {
              throw new Error('Invalid test module.');
            };

      let clean = true;
      let previousDir = null;

      return Promise.resolve()
        .then(() => printHeader(currentFileName, testIndex))
        .then(() => (previousDir = process.cwd()))
        .then(() => logStack.push(lastLogger().createChild(currentFileName)))
        .then(() => fn(() => (clean = false)))
        .then(
          () => logStack.pop(),
          (err) => {
            logStack.pop();
            throw err;
          },
        )
        .then(() => console.log('----'))
        .then(() => {
          // If we're not in a setup, change the directory back to where it was before the test.
          // This allows tests to chdir without worrying about keeping the original directory.
          if (!allSetups.includes(relativeName) && previousDir) {
            process.chdir(previousDir);

            // Restore env variables before each test.
            console.log('  Restoring original environment variables...');
            process.env = originalEnvVariables;
          }
        })
        .then(() => {
          // Only clean after a real test, not a setup step. Also skip cleaning if the test
          // requested an exception.
          if (!allSetups.includes(relativeName) && clean) {
            logStack.push(new logging.NullLogger());
            return gitClean().then(
              () => logStack.pop(),
              (err) => {
                logStack.pop();
                throw err;
              },
            );
          }
        })
        .then(
          () => printFooter(currentFileName, start),
          (err) => {
            printFooter(currentFileName, start);
            console.error(err);
            throw err;
          },
        );
    });
  }, Promise.resolve())
  .then(
    () => {
      registryProcess.kill();
      secureRegistryProcess.kill();

      console.log(colors.green('Done.'));
      process.exit(0);
    },
    (err) => {
      console.log('\n');
      console.error(colors.red(`Test "${currentFileName}" failed...`));
      console.error(colors.red(err.message));
      console.error(colors.red(err.stack));

      registryProcess.kill();
      secureRegistryProcess.kill();

      if (argv.debug) {
        console.log(`Current Directory: ${process.cwd()}`);
        console.log('Will loop forever while you debug... CTRL-C to quit.');

        /* eslint-disable no-constant-condition */
        while (1) {
          // That's right!
        }
      }

      process.exit(1);
    },
  );

function printHeader(testName: string, testIndex: number) {
  const text = `${testIndex + 1} of ${testsToRun.length}`;
  const fullIndex =
    (testIndex < allSetups.length
      ? testIndex
      : (testIndex - allSetups.length) * nbShards + shardId + allSetups.length) + 1;
  const length = tests.length + allSetups.length;
  const shard =
    shardId === null
      ? ''
      : colors.yellow(` [${shardId}:${nbShards}]` + colors.bold(` (${fullIndex}/${length})`));
  console.log(
    colors.green(`Running "${colors.bold.blue(testName)}" (${colors.bold.white(text)}${shard})...`),
  );
}

function printFooter(testName: string, startTime: number) {
  // Round to hundredth of a second.
  const t = Math.round((Date.now() - startTime) / 10) / 100;
  console.log(colors.green('Last step took ') + colors.bold.blue('' + t) + colors.green('s...'));
  console.log('');
}
