import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { startFakeEventServer } from './helpers/fakeEventServer';
import { loadOpencodePlugin } from './helpers/bundleOpencodePlugin';

async function setup() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'placet-oc-'));
  fs.mkdirSync(path.join(workDir, '.placet'), { recursive: true });

  const server = await startFakeEventServer('oc-test-token');
  fs.writeFileSync(
    path.join(workDir, '.placet', 'server.json'),
    JSON.stringify({ port: server.port, token: server.token })
  );

  const { PlacetPlugin } = loadOpencodePlugin();
  const hooks = await PlacetPlugin({ directory: workDir });

  return {
    hooks,
    server,
    cleanup: async () => {
      await server.close();
      fs.rmSync(workDir, { recursive: true, force: true });
    },
  };
}

test('opencode plugin: full task lifecycle — chat.message, todo.updated, file.edited, tool.execute.after, session.idle', async () => {
  const { hooks, server, cleanup } = await setup();
  try {
    const sessionID = 'oc-sess-1';

    await hooks['chat.message'](
      { sessionID },
      { message: { id: 'm1', sessionID, role: 'user' }, parts: [{ type: 'text', text: '  refactor the   auth module   ' }] }
    );

    await hooks.event({
      event: {
        type: 'todo.updated',
        properties: {
          sessionID,
          todos: [
            { id: 't1', content: 'Add JWT middleware', status: 'in_progress', priority: 'high' },
            { id: 't2', content: 'Update login route', status: 'pending', priority: 'medium' },
          ],
        },
      },
    });

    await hooks['tool.execute.after']({ tool: 'edit', sessionID, callID: 'c1', args: { filePath: '/repo/jwt.ts' } });
    await hooks.event({ event: { type: 'file.edited', properties: { file: '/repo/jwt.ts' } } });
    await hooks['tool.execute.after']({ tool: 'bash', sessionID, callID: 'c2', args: { command: 'npm test -- jwt' } });

    await hooks.event({
      event: {
        type: 'todo.updated',
        properties: {
          sessionID,
          todos: [
            { id: 't1', content: 'Add JWT middleware', status: 'completed', priority: 'high' },
            { id: 't2', content: 'Update login route', status: 'in_progress', priority: 'medium' },
          ],
        },
      },
    });
    await hooks['tool.execute.after']({ tool: 'edit', sessionID, callID: 'c3', args: { filePath: '/repo/login.ts' } });
    await hooks.event({ event: { type: 'file.edited', properties: { file: '/repo/login.ts' } } });
    await hooks.event({ event: { type: 'session.idle', properties: { sessionID } } });

    // A prompt while a todo is already active must not create a competing row.
    const countBeforeSecondPrompt = server.received.length;
    await hooks['chat.message'](
      { sessionID },
      { message: { id: 'm2', sessionID, role: 'user' }, parts: [{ type: 'text', text: 'continue' }] }
    );
    assert.equal(server.received.length, countBeforeSecondPrompt, 'no new event for a suppressed turn task');

    assert.ok(server.received.every((r) => r.auth === `Bearer ${server.token}`));

    const events = server.received.map((r) => r.event);
    const t1Id = events.find((e) => e.title === 'Add JWT middleware')?.taskId as string;
    const t2Id = events.find((e) => e.title === 'Update login route' && e.status === 'thinking')?.taskId as string;

    assert.ok(t1Id?.endsWith(':t1'), 'opencode todo id is used directly, no hashing needed');
    assert.ok(t2Id?.endsWith(':t2'));

    const jwtFileEvent = events.find((e) => (e.filesTouched as string[]).includes('/repo/jwt.ts'));
    assert.equal(jwtFileEvent?.taskId, t1Id);

    const testEvent = events.find((e) => e.status === 'testing');
    assert.equal(testEvent?.taskId, t1Id);

    const loginFileEvent = events.find((e) => (e.filesTouched as string[]).includes('/repo/login.ts'));
    assert.equal(loginFileEvent?.taskId, t2Id, 'file.edited after the active todo switches attaches to the new one');

    assert.ok(events.some((e) => e.title === 'Add JWT middleware' && e.status === 'completed'));

    // session.idle reports the still-active task as completed, not
    // 'waiting' — otherwise the session's last task would show "Waiting"
    // forever, since nothing else follows to flip it to done.
    const idleEvent = events[events.length - 1];
    assert.equal(idleEvent.status, 'completed');
    assert.equal(idleEvent.taskId, t2Id);
  } finally {
    await cleanup();
  }
});

test('opencode plugin: a file.edited event racing a todo switch does not misattribute the file (tool.execute.after is authoritative)', async () => {
  const { hooks, server, cleanup } = await setup();
  try {
    const sessionID = 'oc-sess-2';

    await hooks.event({
      event: {
        type: 'todo.updated',
        properties: {
          sessionID,
          todos: [
            { id: 't1', content: 'Task one', status: 'in_progress', priority: 'high' },
            { id: 't2', content: 'Task two', status: 'pending', priority: 'medium' },
          ],
        },
      },
    });
    await hooks['tool.execute.after']({ tool: 'edit', sessionID, callID: 'c1', args: { filePath: '/repo/one.ts' } });

    // Switch active task to t2 before the (sessionID-less) file.edited event
    // for one.ts is delivered — simulating the plugin's event bus reordering
    // relative to the tool call that actually produced it.
    await hooks.event({
      event: {
        type: 'todo.updated',
        properties: {
          sessionID,
          todos: [
            { id: 't1', content: 'Task one', status: 'completed', priority: 'high' },
            { id: 't2', content: 'Task two', status: 'in_progress', priority: 'medium' },
          ],
        },
      },
    });
    await hooks.event({ event: { type: 'file.edited', properties: { file: '/repo/one.ts' } } });

    const events = server.received.map((r) => r.event);
    const t1Id = events.find((e) => e.title === 'Task one')?.taskId as string;
    const t2Id = events.find((e) => e.title === 'Task two' && e.status === 'thinking')?.taskId as string;

    const filesOnT1 = events
      .filter((e) => e.taskId === t1Id)
      .flatMap((e) => e.filesTouched as string[]);
    const filesOnT2 = events
      .filter((e) => e.taskId === t2Id)
      .flatMap((e) => e.filesTouched as string[]);

    assert.deepEqual(filesOnT1, ['/repo/one.ts'], 'attached by tool.execute.after, scoped to the correct task');
    assert.deepEqual(filesOnT2, [], 'the racing file.edited event must not attach the file to the new active task');
  } finally {
    await cleanup();
  }
});

test('opencode plugin: send() is a no-op when Placet is not running for the project', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'placet-oc-nodiscovery-'));
  try {
    const { PlacetPlugin } = loadOpencodePlugin();
    const hooks = await PlacetPlugin({ directory: workDir });
    // No .placet/server.json exists — this must resolve without throwing.
    await hooks['chat.message'](
      { sessionID: 's1' },
      { message: { id: 'm1', sessionID: 's1', role: 'user' }, parts: [{ type: 'text', text: 'hello' }] }
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
