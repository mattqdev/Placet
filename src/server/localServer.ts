import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskEvent, TaskStatus } from '../types';
import { TaskStore } from './taskStore';
import type { Logger } from '../logger';

const VALID_STATUSES: TaskStatus[] = [
  'thinking',
  'coding',
  'testing',
  'waiting',
  'completed',
  'error',
];

function isTaskEvent(body: unknown): body is TaskEvent {
  if (typeof body !== 'object' || body === null) return false;
  const e = body as Record<string, unknown>;
  return (
    (e.source === 'claude-code' || e.source === 'opencode') &&
    typeof e.sessionId === 'string' &&
    typeof e.taskId === 'string' &&
    typeof e.title === 'string' &&
    VALID_STATUSES.includes(e.status as TaskStatus) &&
    Array.isArray(e.filesTouched) &&
    e.filesTouched.every((f) => typeof f === 'string')
  );
}

/**
 * Local-only HTTP server that adapters (Claude Code hook forwarder,
 * opencode plugin) POST normalized TaskEvents to. Binds to 127.0.0.1 and
 * requires a per-session bearer token, written alongside the port to
 * <workspace>/.placet/server.json so adapters can discover both.
 */
export class LocalServer {
  private server?: http.Server;
  private readonly token = crypto.randomBytes(24).toString('hex');
  private readonly discoveryFile: string;

  constructor(
    private readonly workspaceRoot: string,
    private readonly store: TaskStore,
    private readonly logger: Logger
  ) {
    this.discoveryFile = path.join(workspaceRoot, '.placet', 'server.json');
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', resolve);
    });

    const address = this.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    fs.mkdirSync(path.dirname(this.discoveryFile), { recursive: true });
    fs.writeFileSync(
      this.discoveryFile,
      JSON.stringify({ port, token: this.token }, null, 2),
      { mode: 0o600 }
    );
    this.logger.info(`Local server listening on 127.0.0.1:${port}`);
  }

  dispose(): void {
    this.server?.close();
    fs.rmSync(this.discoveryFile, { force: true });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST' || req.url !== '/events') {
      res.writeHead(404).end();
      return;
    }

    const auth = req.headers.authorization;
    if (auth !== `Bearer ${this.token}`) {
      this.logger.warn(`Rejected /events request with invalid or missing token`);
      res.writeHead(401).end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!isTaskEvent(body)) {
          this.logger.warn(`Rejected /events request: invalid TaskEvent shape`);
          res.writeHead(400).end('invalid TaskEvent');
          return;
        }
        this.store.apply(body);
        this.logger.info(
          `Applied event: source=${body.source} task=${body.taskId} status=${body.status} files=${body.filesTouched.length}`
        );
        res.writeHead(204).end();
      } catch (err) {
        this.logger.error('Failed to parse /events request body', err);
        res.writeHead(400).end('invalid JSON');
      }
    });
  }
}
