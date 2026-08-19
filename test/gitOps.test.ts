import test from 'node:test';
import assert from 'node:assert/strict';
import { createTmpRepo, writeFile, commitAll, gitOutput } from './helpers/tmpRepo';
import { getFileStatuses, getDiffPreview, stageFiles, commit, push } from '../src/git/gitOps';

test('gitOps: diff and staging are scoped to exactly the given files', async () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, 'a.txt', 'line1\n');
    writeFile(repo, 'b.txt', 'line1\n');
    commitAll(repo);

    writeFile(repo, 'a.txt', 'line1\nline2\n');
    writeFile(repo, 'b.txt', 'line1\nline2\n');
    writeFile(repo, 'c.txt', 'new file\n');

    const statuses = await getFileStatuses(repo.root, ['a.txt', 'b.txt', 'c.txt']);
    assert.deepEqual(
      statuses.sort((x, y) => x.path.localeCompare(y.path)),
      [
        { path: 'a.txt', kind: 'modified' },
        { path: 'b.txt', kind: 'modified' },
        { path: 'c.txt', kind: 'untracked' },
      ]
    );

    const diff = await getDiffPreview(repo.root, ['a.txt', 'c.txt']);
    assert.match(diff, /a\.txt/);
    assert.match(diff, /c\.txt/);
    assert.doesNotMatch(diff, /b\.txt/, 'a file not in the task must never appear in its diff preview');

    await stageFiles(repo.root, ['a.txt', 'c.txt']);
    const statusAfterStage = gitOutput(repo, ['status', '--short']);
    assert.match(statusAfterStage, /^M {2}a\.txt$/m);
    assert.match(statusAfterStage, /^A {2}c\.txt$/m);
    assert.match(statusAfterStage, /^ M b\.txt$/m, 'b.txt must remain unstaged');

    await commit(repo.root, 'feat: scoped commit');
    const log = gitOutput(repo, ['log', '-1', '--pretty=%s']).trim();
    assert.equal(log, 'feat: scoped commit');

    const statusAfterCommit = gitOutput(repo, ['status', '--short']).trim();
    assert.equal(statusAfterCommit, 'M b.txt', 'b.txt was never staged, so the commit must not include it');
  } finally {
    repo.cleanup();
  }
});

test('gitOps: getDiffPreview renders untracked files as synthetic additions when there is no HEAD diff', async () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, 'first.txt', 'hello\n');
    commitAll(repo, 'initial');
    writeFile(repo, 'second.txt', 'brand new content\n');

    const diff = await getDiffPreview(repo.root, ['second.txt']);
    assert.match(diff, /\+\+\+ second\.txt/);
    assert.match(diff, /\+brand new content/);
  } finally {
    repo.cleanup();
  }
});

test('gitOps: push fails gracefully (no throw) when there is no remote configured', async () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, 'a.txt', 'hello\n');
    commitAll(repo);

    const result = await push(repo.root);
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error && result.error.length > 0);
  } finally {
    repo.cleanup();
  }
});

test('gitOps: getDiffPreview on a brand-new repo with no commits yet does not throw', async () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, 'a.txt', 'hello\n');
    // Deliberately no commit yet — HEAD doesn't exist.
    const diff = await getDiffPreview(repo.root, ['a.txt']);
    assert.match(diff, /a\.txt/);
  } finally {
    repo.cleanup();
  }
});

test('gitOps: empty file list is a no-op everywhere', async () => {
  const repo = createTmpRepo();
  try {
    assert.deepEqual(await getFileStatuses(repo.root, []), []);
    assert.equal(await getDiffPreview(repo.root, []), '');
    await stageFiles(repo.root, []); // must not throw
    assert.equal(gitOutput(repo, ['status', '--short']).trim(), '');
  } finally {
    repo.cleanup();
  }
});
