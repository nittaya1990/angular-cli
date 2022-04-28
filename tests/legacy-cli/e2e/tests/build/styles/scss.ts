import {
  writeMultipleFiles,
  deleteFile,
  expectFileToMatch,
  replaceInFile,
} from '../../../utils/fs';
import { expectToFail } from '../../../utils/utils';
import { ng } from '../../../utils/process';
import { updateJsonFile } from '../../../utils/project';

export default function () {
  // TODO(architect): Delete this test. It is now in devkit/build-angular.

  return writeMultipleFiles({
    'src/styles.scss': `
      @import './imported-styles.scss';
      body { background-color: blue; }
    `,
    'src/imported-styles.scss': 'p { background-color: red; }',
    'src/app/app.component.scss': `
        .outer {
          .inner {
            background: #fff;
          }
        }
      `,
  })
    .then(() => deleteFile('src/app/app.component.css'))
    .then(() =>
      updateJsonFile('angular.json', (workspaceJson) => {
        const appArchitect = workspaceJson.projects['test-project'].architect;
        appArchitect.build.options.styles = [{ input: 'src/styles.scss' }];
      }),
    )
    .then(() =>
      replaceInFile('src/app/app.component.ts', './app.component.css', './app.component.scss'),
    )
    .then(() => ng('build', '--source-map', '--configuration=development'))
    .then(() =>
      expectFileToMatch('dist/test-project/styles.css', /body\s*{\s*background-color: blue;\s*}/),
    )
    .then(() =>
      expectFileToMatch('dist/test-project/styles.css', /p\s*{\s*background-color: red;\s*}/),
    )
    .then(() =>
      expectToFail(() => expectFileToMatch('dist/test-project/styles.css', '"mappings":""')),
    )
    .then(() =>
      expectFileToMatch('dist/test-project/main.js', /.outer.*.inner.*background:\s*#[fF]+/),
    );
}
