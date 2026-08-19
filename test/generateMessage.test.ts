import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCommitMessage,
  buildPrompt,
  cleanMessage,
  fallbackMessage,
} from '../src/commit/generateMessage';
import type { Task } from '../src/types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 't1',
    source: 'claude-code',
    sessionId: 's1',
    title: 'Add JWT middleware',
    status: 'completed',
    filesTouched: ['a.ts', 'b.ts'],
    createdAt: 0,
    updatedAt: 0,
    reviewed: false,
    ...overrides,
  };
}

test('buildPrompt: includes the style instruction, subject length cap, task title and files', () => {
  const prompt = buildPrompt(task(), 'diff --git a/a.ts b/a.ts', {
    style: 'conventional-commits',
    maxSubjectLength: 50,
  });
  assert.match(prompt, /Conventional Commits/);
  assert.match(prompt, /under 50 characters/);
  assert.match(prompt, /Add JWT middleware/);
  assert.match(prompt, /- a\.ts/);
  assert.match(prompt, /- b\.ts/);
});

test('buildPrompt: freeform style asks for a plain imperative line instead', () => {
  const prompt = buildPrompt(task(), '', { style: 'freeform', maxSubjectLength: 72 });
  assert.match(prompt, /imperative-mood/);
  assert.doesNotMatch(prompt, /Conventional Commits/);
});

test('cleanMessage: strips markdown code fences and surrounding quotes', () => {
  assert.equal(cleanMessage('```\nfeat: add thing\n```'), 'feat: add thing');
  assert.equal(cleanMessage('"feat: add thing"'), 'feat: add thing');
  assert.equal(cleanMessage('  feat: add thing  \n'), 'feat: add thing');
});

test('fallbackMessage: deterministic template, singular/plural file wording', () => {
  assert.equal(fallbackMessage(task({ filesTouched: ['a.ts'] })), 'Update 1 file: Add JWT middleware');
  assert.equal(fallbackMessage(task({ filesTouched: ['a.ts', 'b.ts'] })), 'Update 2 files: Add JWT middleware');
});

test('generateCommitMessage: falls back to the template when the claude binary does not exist', async () => {
  // No mocking needed: point PATH somewhere without a `claude` binary so
  // execFile('claude', ...) reliably fails with ENOENT, exercising the
  // real fallback branch without ever calling a live model.
  const originalPath = process.env.PATH;
  process.env.PATH = '/nonexistent-placet-test-path';
  try {
    const warnings: string[] = [];
    const message = await generateCommitMessage(task(), 'diff', { style: 'conventional-commits', maxSubjectLength: 72 }, {
      warn: (m) => warnings.push(m),
    });
    assert.equal(message, fallbackMessage(task()));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Falling back to a template commit message/);
  } finally {
    process.env.PATH = originalPath;
  }
});
