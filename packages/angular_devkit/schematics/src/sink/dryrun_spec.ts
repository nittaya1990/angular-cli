/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { Path, normalize, virtualFs } from '@angular-devkit/core';
import { toArray } from 'rxjs/operators';
import { HostCreateTree, HostTree } from '../tree/host-tree';
import { DryRunSink } from './dryrun';

const host = new virtualFs.test.TestHost({
  '/hello': '',
  '/sub/file1': '',
  '/sub/directory/file2': '',
});

describe('DryRunSink', () => {
  it('works when creating everything', async () => {
    const tree = new HostCreateTree(host);

    tree.create('/test', 'testing 1 2');
    const recorder = tree.beginUpdate('/test');
    recorder.insertLeft(8, 'testing ');
    tree.commitUpdate(recorder);
    tree.overwrite('/hello', 'world');

    const files = ['/hello', '/sub/directory/file2', '/sub/file1', '/test'];
    const treeFiles: Path[] = [];
    tree.visit((path) => treeFiles.push(path));
    treeFiles.sort();
    expect(treeFiles).toEqual(files.map(normalize));

    const sink = new DryRunSink(new virtualFs.SimpleMemoryHost());

    const [infos] = await Promise.all([
      sink.reporter.pipe(toArray()).toPromise(),
      sink.commit(tree).toPromise(),
    ]);

    expect(infos.length).toBe(4);

    for (const info of infos) {
      expect(info.kind).toBe('create');
    }
  });

  it('works with root', async () => {
    const tree = new HostTree(host);

    tree.create('/test', 'testing 1 2');
    const recorder = tree.beginUpdate('/test');
    recorder.insertLeft(8, 'testing ');
    tree.commitUpdate(recorder);
    tree.overwrite('/hello', 'world');

    const files = ['/hello', '/sub/directory/file2', '/sub/file1', '/test'];
    const treeFiles: Path[] = [];
    tree.visit((path) => treeFiles.push(path));
    treeFiles.sort();
    expect(treeFiles).toEqual(files.map(normalize));

    // Need to create this file on the filesystem, otherwise the commit phase will fail.
    const outputHost = new virtualFs.SimpleMemoryHost();
    outputHost.write(normalize('/hello'), virtualFs.stringToFileBuffer('')).subscribe();

    const sink = new DryRunSink(outputHost);
    const [infos] = await Promise.all([
      sink.reporter.pipe(toArray()).toPromise(),
      sink.commit(tree).toPromise(),
    ]);

    expect(infos.map((x) => x.kind)).toEqual(['create', 'update']);
  });
});
