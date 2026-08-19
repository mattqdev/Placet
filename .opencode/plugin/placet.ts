import type { Plugin } from '@opencode-ai/plugin';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';

/**
 * Placet's opencode adapter. Ships as a plain .ts file copied verbatim into
 * <project>/.opencode/plugin/placet.ts by "Placet: Connect opencode" — it
 * has no machine-specific paths baked in (unlike the Claude Code hook
 * config), so unlike that one, this file is safe to commit and share.
 *
 * Unlike Claude Code's hooks (a fresh process per event), opencode loads
 * this plugin once and keeps it resident for the life of the opencode
 * process, so per-session task state just lives in memory here — no cache
 * file needed.
 *
 * Task boundary strategy mirrors the Claude Code adapter: prefer opencode's
 * own todo list (each todo already has a stable `id`) with the in_progress
 * item as the "active" task; fall back to one task per user turn while no
 * todo is in progress.
 */

type TaskStatus = 'thinking' | 'coding' | 'testing' | 'waiting' | 'completed' | 'error';

interface TaskEvent {
  source: 'opencode';
  sessionId: string;
  taskId: string;
  title: string;
  status: TaskStatus;
  filesTouched: string[];
  timestamp: number;
  /** Raw user prompt, set only on the turn-creation event — see placet's
   * src/adapters/titleSynthesizer.ts for how this becomes a better title. */
  prompt?: string;
}

interface Discovery {
  port: number;
  token: string;
}

interface TaskState {
  turnTaskId?: string;
  turnTitle?: string;
  activeTaskId?: string;
  activeTaskTitle?: string;
}

const TEST_COMMAND_PATTERNS: RegExp[] = [
  /\bnpm\s+(run\s+)?test\b/i,
  /\byarn\s+test\b/i,
  /\bpnpm\s+test\b/i,
  /\bpytest\b/i,
  /\bgo\s+test\b/i,
  /\bcargo\s+test\b/i,
  /\bjest\b/i,
  /\bvitest\b/i,
  /\bmocha\b/i,
  /\brspec\b/i,
  /\bphpunit\b/i,
  /\bdotnet\s+test\b/i,
  /\bmvn\s+test\b/i,
  /\bgradle\s+test\b/i,
  /\bmake\s+test\b/i,
];

const EDIT_TOOL_NAMES = new Set(['edit', 'write', 'patch', 'multiedit']);

// Not real summarization (no LLM call here) — chat.message blocks opencode
// from proceeding until it returns, so a synchronous LLM round-trip would
// add real latency to every single prompt. This is a fast, local, "good
// enough" cleanup: strip filler openers and cut at a word boundary instead
// of dumping the raw prompt truncated mid-word.
const FILLER_PREFIX_PATTERNS: RegExp[] = [
  /^(please|could you please|could you|can you please|can you|would you|will you)\s+/i,
  /^(i want you to|i'd like you to|i need you to|i would like you to)\s+/i,
  /^(let's|lets|now|ok,?|okay,?|so,?)\s+/i,
];

function summarize(text: string, maxChars = 48): string {
  let flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '';

  for (const pattern of FILLER_PREFIX_PATTERNS) {
    flat = flat.replace(pattern, '');
  }
  flat = flat.trim();
  if (flat.length === 0) return '';
  flat = flat[0].toUpperCase() + flat.slice(1);

  if (flat.length <= maxChars) return flat;

  const words = flat.slice(0, maxChars + 1).split(' ');
  words.pop();
  const cut = words.join(' ').trim();
  return `${cut || flat.slice(0, maxChars)}…`;
}

function readDiscovery(directory: string): Discovery | undefined {
  try {
    const raw = fs.readFileSync(path.join(directory, '.placet', 'server.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.port === 'number' && typeof parsed.token === 'string') return parsed;
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

function todoStatus(status: string): TaskStatus {
  switch (status) {
    case 'in_progress':
      return 'thinking';
    case 'completed':
    case 'cancelled':
      return 'completed';
    default:
      return 'waiting';
  }
}

function extractCommand(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const record = args as Record<string, unknown>;
  const candidate = record.command ?? record.cmd;
  return typeof candidate === 'string' ? candidate : undefined;
}

function extractFilePath(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const record = args as Record<string, unknown>;
  const candidate = record.filePath ?? record.file_path ?? record.path;
  return typeof candidate === 'string' ? candidate : undefined;
}

// Telemetry must never disrupt the user's opencode session — swallow
// anything a handler throws instead of letting it surface as a plugin error.
function safe<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await fn(...args);
    } catch {
      // best-effort
    }
  };
}

export const PlacetPlugin: Plugin = async ({ directory }) => {
  const sessions = new Map<string, TaskState>();
  let lastActiveSessionId: string | undefined;

  function state(sessionId: string): TaskState {
    let s = sessions.get(sessionId);
    if (!s) {
      s = {};
      sessions.set(sessionId, s);
    }
    return s;
  }

  function target(sessionId: string): { taskId: string; title: string } | undefined {
    const s = state(sessionId);
    if (s.activeTaskId && s.activeTaskTitle) return { taskId: s.activeTaskId, title: s.activeTaskTitle };
    if (s.turnTaskId && s.turnTitle) return { taskId: s.turnTaskId, title: s.turnTitle };
    return undefined;
  }

  function send(event: TaskEvent): Promise<void> {
    const discovery = readDiscovery(directory);
    if (!discovery) return Promise.resolve(); // Placet isn't running for this project.
    return postEvent(discovery, event);
  }

  return {
    event: safe(async ({ event }) => {
      if (event.type === 'todo.updated') {
        const { sessionID, todos } = event.properties;
        lastActiveSessionId = sessionID;
        const s = state(sessionID);
        const active = todos.find((t) => t.status === 'in_progress');
        s.activeTaskId = active ? `${sessionID}:${active.id}` : undefined;
        s.activeTaskTitle = active ? active.content : undefined;

        await Promise.all(
          todos.map((todo) =>
            send({
              source: 'opencode',
              sessionId: sessionID,
              taskId: `${sessionID}:${todo.id}`,
              title: todo.content,
              status: todoStatus(todo.status),
              filesTouched: [],
              timestamp: Date.now(),
            })
          )
        );
        return;
      }

      if (event.type === 'session.idle') {
        const { sessionID } = event.properties;
        const t = target(sessionID);
        if (!t) return;
        // session.idle fires once the AI has finished responding, so
        // whatever task was active is, by definition, the one it just
        // finished working on — nothing else will come along afterwards to
        // flip it to "completed" (that only happens today when a
        // *subsequent* todo.updated marks it done, which never happens for
        // the session's last task). Reporting it as completed rather than
        // 'waiting' avoids leaving the last task of every session stuck
        // showing "Waiting" forever.
        await send({
          source: 'opencode',
          sessionId: sessionID,
          taskId: t.taskId,
          title: t.title,
          status: 'completed',
          filesTouched: [],
          timestamp: Date.now(),
        });
        return;
      }

      if (event.type === 'file.edited') {
        // This event carries no sessionID, so it's attributed to whichever
        // session most recently had activity — which can race with a
        // todo.updated that has just switched the active task, misfiling
        // the file under the wrong one. tool.execute.after (below) already
        // attaches the file directly, scoped to its own sessionID, at the
        // exact moment the edit happens, so this is just a status nudge —
        // it deliberately does not touch filesTouched.
        const sessionID = lastActiveSessionId;
        if (!sessionID) return;
        const t = target(sessionID);
        if (!t) return;
        await send({
          source: 'opencode',
          sessionId: sessionID,
          taskId: t.taskId,
          title: t.title,
          status: 'coding',
          filesTouched: [],
          timestamp: Date.now(),
        });
      }
    }),

    'chat.message': safe(async (input, output) => {
      lastActiveSessionId = input.sessionID;
      const s = state(input.sessionID);
      // A todo already in progress owns file/status attribution — don't
      // start a competing "turn" task that would just go stale.
      if (s.activeTaskId) return;

      const text = output.parts
        .filter((part) => part.type === 'text')
        .map((part) => (part as { text: string }).text)
        .join(' ');
      const turnTaskId = `${input.sessionID}:turn:${Date.now()}`;
      const turnTitle = summarize(text) || 'Untitled task';
      s.turnTaskId = turnTaskId;
      s.turnTitle = turnTitle;

      await send({
        source: 'opencode',
        sessionId: input.sessionID,
        taskId: turnTaskId,
        title: turnTitle,
        status: 'thinking',
        filesTouched: [],
        timestamp: Date.now(),
        prompt: text,
      });
    }),

    'tool.execute.after': safe(async (input) => {
      lastActiveSessionId = input.sessionID;
      const t = target(input.sessionID);
      if (!t) return;

      const toolName = input.tool.toLowerCase();
      let status: TaskStatus = 'thinking';
      let filesTouched: string[] = [];
      if (EDIT_TOOL_NAMES.has(toolName)) {
        status = 'coding';
        // Attach the file here, scoped to this exact tool call's sessionID
        // and the target task computed at this exact moment — more
        // reliable than the separate (sessionID-less) file.edited event,
        // which could otherwise land on whatever task a later todo.updated
        // has since switched to.
        const file = extractFilePath(input.args);
        if (file) filesTouched = [file];
      } else if (toolName === 'bash') {
        const command = extractCommand(input.args);
        status = command && TEST_COMMAND_PATTERNS.some((p) => p.test(command)) ? 'testing' : 'coding';
      }

      await send({
        source: 'opencode',
        sessionId: input.sessionID,
        taskId: t.taskId,
        title: t.title,
        status,
        filesTouched,
        timestamp: Date.now(),
      });
    }),
  };
};
