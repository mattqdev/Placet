import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/adapters/claudeCode/translate';
import type { SessionCache } from '../src/adapters/claudeCode/sessionCache';

function payload(overrides: Record<string, unknown>): Record<string, unknown> {
  return { session_id: 'sess-1', cwd: '/repo', ...overrides };
}

test('UserPromptSubmit creates a turn task with a cleaned-up title', () => {
  const result = translate(
    'UserPromptSubmit',
    payload({ prompt: '  please refactor   the auth module   ' }),
    {}
  );
  assert.equal(result.events.length, 1);
  const [event] = result.events;
  assert.equal(event.status, 'thinking');
  assert.equal(event.title, 'Refactor the auth module');
  assert.equal(result.cache.turnTaskId, event.taskId);
});

test('UserPromptSubmit is suppressed while a todo is already active (no orphaned row)', () => {
  const cache: SessionCache = { activeTaskId: 'sess-1:abc', activeTaskTitle: 'Do X' };
  const result = translate('UserPromptSubmit', payload({ prompt: 'continue' }), cache);
  assert.equal(result.events.length, 0);
  assert.equal(result.cache, cache);
});

test('TodoWrite emits one event per todo and tracks the in_progress one as active', () => {
  const result = translate(
    'PostToolUse',
    payload({
      tool_name: 'TodoWrite',
      tool_input: {
        todos: [
          { content: 'Add JWT middleware', status: 'in_progress' },
          { content: 'Update login route', status: 'pending' },
        ],
      },
    }),
    {}
  );
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].status, 'thinking');
  assert.equal(result.events[1].status, 'waiting');
  assert.equal(result.cache.activeTaskTitle, 'Add JWT middleware');
  assert.ok(result.cache.activeTaskId);
});

test('todo taskIds are stable across calls for the same content', () => {
  const first = translate(
    'PostToolUse',
    payload({ tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'Add JWT middleware', status: 'in_progress' }] } }),
    {}
  );
  const second = translate(
    'PostToolUse',
    payload({ tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'Add JWT middleware', status: 'completed' }] } }),
    {}
  );
  assert.equal(first.events[0].taskId, second.events[0].taskId);
  assert.equal(second.events[0].status, 'completed');
});

test('Edit while a todo is active attaches the file to that todo, marked coding', () => {
  const cache: SessionCache = { activeTaskId: 'sess-1:abc', activeTaskTitle: 'Add JWT middleware' };
  const result = translate(
    'PostToolUse',
    payload({ tool_name: 'Edit', tool_input: { file_path: '/repo/src/jwt.ts' } }),
    cache
  );
  assert.equal(result.events.length, 1);
  const [event] = result.events;
  assert.equal(event.taskId, 'sess-1:abc');
  assert.equal(event.status, 'coding');
  assert.deepEqual(event.filesTouched, ['/repo/src/jwt.ts']);
});

test('Edit falls back to the turn task when no todo is active', () => {
  const cache: SessionCache = { turnTaskId: 'sess-1:turn:1', turnTitle: 'Do something' };
  const result = translate(
    'PostToolUse',
    payload({ tool_name: 'Write', tool_input: { file_path: '/repo/new.ts' } }),
    cache
  );
  assert.equal(result.events[0].taskId, 'sess-1:turn:1');
});

test('Bash with a recognized test command is classified as testing', () => {
  const cache: SessionCache = { activeTaskId: 'sess-1:abc', activeTaskTitle: 'Add JWT middleware' };
  const result = translate(
    'PostToolUse',
    payload({ tool_name: 'Bash', tool_input: { command: 'npm test -- jwt' } }),
    cache
  );
  assert.equal(result.events[0].status, 'testing');
});

test('Bash without a test command is classified as coding', () => {
  const cache: SessionCache = { activeTaskId: 'sess-1:abc', activeTaskTitle: 'Add JWT middleware' };
  const result = translate('PostToolUse', payload({ tool_name: 'Bash', tool_input: { command: 'ls -la' } }), cache);
  assert.equal(result.events[0].status, 'coding');
});

test('a failed tool_response is classified as error', () => {
  const cache: SessionCache = { activeTaskId: 'sess-1:abc', activeTaskTitle: 'Add JWT middleware' };
  const result = translate(
    'PostToolUse',
    payload({ tool_name: 'Bash', tool_input: { command: 'ls -la' }, tool_response: { error: 'boom' } }),
    cache
  );
  assert.equal(result.events[0].status, 'error');
});

test('Stop attaches to the active todo when one exists', () => {
  const result = translate('Stop', payload({}), { activeTaskId: 'sess-1:abc', activeTaskTitle: 'Add JWT middleware' });
  assert.equal(result.events[0].taskId, 'sess-1:abc');
  assert.equal(result.events[0].status, 'waiting');
});

test('Stop falls back to the turn task when no todo is active', () => {
  const result = translate('Stop', payload({}), { turnTaskId: 'sess-1:turn:1', turnTitle: 'Do something' });
  assert.equal(result.events[0].taskId, 'sess-1:turn:1');
});

test('events without a session_id are ignored', () => {
  const result = translate('UserPromptSubmit', { prompt: 'x' }, {});
  assert.equal(result.events.length, 0);
});
