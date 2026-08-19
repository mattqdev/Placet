import test from 'node:test';
import assert from 'node:assert/strict';
import { createTmpRepo, writeFile, readFile } from './helpers/tmpRepo';
import { ensureGitignoreEntry } from '../src/workspace/ensureGitignore';
import type { Logger } from '../src/logger';

// ensureGitignoreEntry only ever calls logger.info(); Logger has private
// fields so a plain object can't structurally satisfy it — cast is fine
// for a test double.
const fakeLogger = { info: () => {} } as unknown as Logger;

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('ensureGitignoreEntry: creates .gitignore when none exists', () => {
  const repo = createTmpRepo();
  try {
    ensureGitignoreEntry(repo.root, '.placet/', 'test reason', fakeLogger);
    const content = readFile(repo, '.gitignore');
    assert.match(content, /test reason — do not commit/);
    assert.match(content, /^\.placet\/$/m);
  } finally {
    repo.cleanup();
  }
});

test('ensureGitignoreEntry: appends to an empty .gitignore', () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, '.gitignore', '');
    ensureGitignoreEntry(repo.root, '.placet/', 'test reason', fakeLogger);
    assert.match(readFile(repo, '.gitignore'), /^\.placet\/$/m);
  } finally {
    repo.cleanup();
  }
});

test('ensureGitignoreEntry: appends cleanly with no leftover blank-line mess when the file has no trailing newline', () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, '.gitignore', 'node_modules/\ndist/');
    ensureGitignoreEntry(repo.root, '.placet/', 'test reason', fakeLogger);
    const content = readFile(repo, '.gitignore');
    assert.match(content, /node_modules\//);
    assert.match(content, /dist\//);
    assert.match(content, /^\.placet\/$/m);
  } finally {
    repo.cleanup();
  }
});

test('ensureGitignoreEntry: is a no-op when the entry is already covered', () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, '.gitignore', 'node_modules/\n.placet/\n');
    ensureGitignoreEntry(repo.root, '.placet/', 'test reason', fakeLogger);
    assert.equal(readFile(repo, '.gitignore'), 'node_modules/\n.placet/\n');
  } finally {
    repo.cleanup();
  }
});

test('ensureGitignoreEntry: recognizes an existing entry even without a trailing slash', () => {
  const repo = createTmpRepo();
  try {
    writeFile(repo, '.gitignore', 'node_modules/\n.placet\n');
    ensureGitignoreEntry(repo.root, '.placet/', 'test reason', fakeLogger);
    assert.equal(readFile(repo, '.gitignore'), 'node_modules/\n.placet\n', 'must not add a redundant second entry');
  } finally {
    repo.cleanup();
  }
});

test('ensureGitignoreEntry: calling it twice never duplicates the entry', () => {
  const repo = createTmpRepo();
  try {
    ensureGitignoreEntry(repo.root, '.claude/settings.local.json', 'reason A', fakeLogger);
    ensureGitignoreEntry(repo.root, '.claude/settings.local.json', 'reason A', fakeLogger);
    const content = readFile(repo, '.gitignore');
    assert.equal(countOccurrences(content, '.claude/settings.local.json'), 1);
  } finally {
    repo.cleanup();
  }
});

test('ensureGitignoreEntry: the reason text is per-call, not a fixed generic message', () => {
  const repo = createTmpRepo();
  try {
    ensureGitignoreEntry(repo.root, '.claude/settings.local.json', 'Placet Claude Code hooks (personal)', fakeLogger);
    const content = readFile(repo, '.gitignore');
    assert.match(content, /Placet Claude Code hooks \(personal\)/);
    assert.doesNotMatch(content, /port \+ secret token/);
  } finally {
    repo.cleanup();
  }
});
