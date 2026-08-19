import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskStore } from '../src/server/taskStore';
import type { TaskEvent } from '../src/types';

function event(overrides: Partial<TaskEvent>): TaskEvent {
  return {
    source: 'claude-code',
    sessionId: 's1',
    taskId: 't1',
    title: 'Do the thing',
    status: 'thinking',
    filesTouched: [],
    timestamp: Date.now(),
    ...overrides,
  };
}

test('apply: a new event creates a task and notifies listeners', () => {
  const store = new TaskStore();
  let changes = 0;
  store.onDidChange(() => changes++);

  store.apply(event({}));

  assert.equal(store.list().length, 1);
  assert.equal(changes, 1);
  assert.equal(store.get('t1')?.title, 'Do the thing');
  assert.equal(store.get('t1')?.reviewed, false);
});

test('apply: filesTouched accumulates (union) across events for the same taskId', () => {
  const store = new TaskStore();
  store.apply(event({ filesTouched: ['a.ts'], timestamp: 1 }));
  store.apply(event({ filesTouched: ['b.ts'], status: 'coding', timestamp: 2 }));
  store.apply(event({ filesTouched: ['a.ts'], status: 'coding', timestamp: 3 })); // duplicate, must not double up

  const task = store.get('t1');
  assert.deepEqual([...task!.filesTouched].sort(), ['a.ts', 'b.ts']);
  assert.equal(task!.status, 'coding', 'status reflects the latest event');
  assert.equal(task!.createdAt, 1, 'createdAt is pinned to the first event');
  assert.equal(task!.updatedAt, 3);
});

test('apply: an empty title on a later event keeps the previous title instead of blanking it', () => {
  const store = new TaskStore();
  store.apply(event({ title: 'Original title' }));
  store.apply(event({ title: '' }));
  assert.equal(store.get('t1')?.title, 'Original title');
});

test('markReviewed: flips reviewed and notifies; no-ops for an unknown taskId', () => {
  const store = new TaskStore();
  let changes = 0;
  store.onDidChange(() => changes++);

  store.markReviewed('does-not-exist');
  assert.equal(changes, 0);

  store.apply(event({}));
  changes = 0;
  store.markReviewed('t1');
  assert.equal(store.get('t1')?.reviewed, true);
  assert.equal(changes, 1);
});

test('apply: an inferred waiting/completed event does not clobber a prior error status', () => {
  const store = new TaskStore();
  store.apply(event({ status: 'error', timestamp: 1 }));
  store.apply(event({ status: 'completed', timestamp: 2 })); // e.g. Stop/session.idle firing after the failure
  assert.equal(store.get('t1')?.status, 'error');
});

test('apply: a fresh activity event still clears a prior error status', () => {
  const store = new TaskStore();
  store.apply(event({ status: 'error', timestamp: 1 }));
  store.apply(event({ status: 'coding', timestamp: 2 })); // agent retried
  assert.equal(store.get('t1')?.status, 'coding');
});

test('list: sorted newest-first by updatedAt', () => {
  const store = new TaskStore();
  store.apply(event({ taskId: 'old', timestamp: 1 }));
  store.apply(event({ taskId: 'new', timestamp: 2 }));
  assert.deepEqual(
    store.list().map((t) => t.taskId),
    ['new', 'old']
  );
});
