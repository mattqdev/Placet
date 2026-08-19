import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { startFakeEventServer, type FakeEventServer } from './helpers/fakeEventServer';

const FORWARDER = path.resolve(process.cwd(), 'dist', 'forwarder.js');

function runForwarder(hookEventName: string, payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [FORWARDER, hookEventName], { stdio: ['pipe', 'inherit', 'inherit'] });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`forwarder exited ${code}`))));
    child.on('error', reject);
  });
}

async function setup(): Promise<{ workDir: string; server: FakeEventServer; cleanup: () => Promise<void> }> {
  assert.ok(fs.existsSync(FORWARDER), `${FORWARDER} is missing — run "npm run compile" first`);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'placet-fwd-'));
  fs.mkdirSync(path.join(workDir, '.placet'), { recursive: true });

  const server = await startFakeEventServer('fwd-test-token');
  fs.writeFileSync(
    path.join(workDir, '.placet', 'server.json'),
    JSON.stringify({ port: server.port, token: server.token })
  );

  return {
    workDir,
    server,
    cleanup: async () => {
      await server.close();
      fs.rmSync(workDir, { recursive: true, force: true });
    },
  };
}

test('forwarder: real dist/forwarder.js drives a full task lifecycle through the real HTTP contract', async () => {
  const { workDir, server, cleanup } = await setup();
  try {
    const sessionId = 'fwd-sess-1';

    await runForwarder('UserPromptSubmit', { session_id: sessionId, cwd: workDir, prompt: 'Refactor the auth module' });

    await runForwarder('PostToolUse', {
      session_id: sessionId,
      cwd: workDir,
      tool_name: 'TodoWrite',
      tool_input: {
        todos: [
          { content: 'Add JWT middleware', status: 'in_progress' },
          { content: 'Update login route', status: 'pending' },
        ],
      },
    });

    await runForwarder('PostToolUse', {
      session_id: sessionId,
      cwd: workDir,
      tool_name: 'Edit',
      tool_input: { file_path: '/repo/jwt.ts', old_string: 'a', new_string: 'b' },
    });

    await runForwarder('Stop', { session_id: sessionId, cwd: workDir, stop_hook_active: false });

    assert.ok(server.received.every((r) => r.auth === `Bearer ${server.token}`), 'every request carried the discovered bearer token');

    const events = server.received.map((r) => r.event);
    // UserPromptSubmit(1) + TodoWrite(2, one per todo) + Edit(1) + Stop(1)
    assert.equal(events.length, 5);

    const jwtTaskId = events.find((e) => e.title === 'Add JWT middleware')?.taskId;
    const editEvent = events.find((e) => (e.filesTouched as string[]).includes('/repo/jwt.ts'));
    assert.equal(editEvent?.taskId, jwtTaskId, 'the Edit call attached to the in_progress todo, not the turn task');
    assert.equal(editEvent?.status, 'coding');

    const stopEvent = events[events.length - 1];
    assert.equal(stopEvent.status, 'waiting');
    assert.equal(stopEvent.taskId, jwtTaskId);
  } finally {
    await cleanup();
  }
});

test('forwarder: silently no-ops when there is no .placet/server.json (Placet not running)', async () => {
  assert.ok(fs.existsSync(FORWARDER), `${FORWARDER} is missing — run "npm run compile" first`);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'placet-fwd-nodiscovery-'));
  try {
    await runForwarder('UserPromptSubmit', { session_id: 's1', cwd: workDir, prompt: 'hello' });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
