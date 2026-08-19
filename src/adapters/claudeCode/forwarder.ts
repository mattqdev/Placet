import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { readSessionCache, writeSessionCache } from './sessionCache';
import { translate } from './translate';
import type { TaskEvent } from '../../types';

/**
 * Entry point invoked by a Claude Code hook: `node forwarder.js <HookEventName>`,
 * with the hook's JSON payload on stdin. Translates it to normalized
 * TaskEvent(s) and POSTs them to Placet's local server for this workspace.
 *
 * Runs as a fresh, standalone Node process per hook call — never imports
 * `vscode` and must never throw or exit non-zero, since that would surface
 * as a scary error inside the user's Claude Code session for something
 * that's just our own telemetry plumbing.
 */

interface Discovery {
  port: number;
  token: string;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function readDiscovery(workspaceRoot: string): Discovery | undefined {
  try {
    const raw = fs.readFileSync(path.join(workspaceRoot, '.placet', 'server.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.port === 'number' && typeof parsed.token === 'string') {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function postEvent(discovery: Discovery, event: TaskEvent): Promise<void> {
  return new Promise((resolve) => {
    const body = JSON.stringify(event);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: discovery.port,
        path: '/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${discovery.token}`,
        },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve();
      }
    );
    req.on('error', () => resolve());
    req.on('timeout', () => req.destroy());
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  const hookEventName = process.argv[2];
  if (!hookEventName) return;

  const raw = await readStdin();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const workspaceRoot = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
  const discovery = readDiscovery(workspaceRoot);
  if (!discovery) return; // Placet isn't running for this workspace right now.

  const sessionId = payload.session_id;
  if (typeof sessionId !== 'string') return;

  const cache = readSessionCache(workspaceRoot, sessionId);
  const { events, cache: nextCache } = translate(hookEventName, payload, cache);
  if (nextCache !== cache) {
    writeSessionCache(workspaceRoot, sessionId, nextCache);
  }

  await Promise.all(events.map((event) => postEvent(discovery, event)));
}

main().catch(() => {
  // Swallow everything — see file-level comment.
});
