import * as crypto from 'node:crypto';
import type { TaskEvent, TaskStatus } from '../../types';
import type { SessionCache } from './sessionCache';

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

// Tool name -> the tool_input field that holds the file path it wrote to.
const FILE_TOOLS: Record<string, string> = {
  Edit: 'file_path',
  Write: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
};

export interface TranslateResult {
  events: TaskEvent[];
  cache: SessionCache;
}

/**
 * Pure translation from a Claude Code hook payload to normalized
 * TaskEvents. No fs/network side effects, so it's cheap to unit test.
 *
 * Task boundary strategy: prefer the AI's own TodoWrite list (each todo's
 * `content` becomes a stable taskId via hashing, so status flips in place
 * across separate TodoWrite calls). While no todo is in_progress, file
 * edits and tool calls fall back to a single "current turn" task created at
 * UserPromptSubmit.
 */
export function translate(
  hookEventName: string,
  payload: Record<string, unknown>,
  cache: SessionCache
): TranslateResult {
  const sessionId = payload.session_id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return { events: [], cache };
  }
  const timestamp = Date.now();

  switch (hookEventName) {
    case 'UserPromptSubmit':
      return translateUserPromptSubmit(sessionId, payload, cache, timestamp);
    case 'Stop':
      return translateStop(sessionId, cache, timestamp);
    case 'PostToolUse':
      return translatePostToolUse(sessionId, payload, cache, timestamp);
    default:
      return { events: [], cache };
  }
}

function translateUserPromptSubmit(
  sessionId: string,
  payload: Record<string, unknown>,
  cache: SessionCache,
  timestamp: number
): TranslateResult {
  // If a todo item is already in progress, attribute everything to it
  // instead of starting a new turn task — otherwise the previous turn's row
  // is orphaned (stuck at "thinking" forever, since Stop only updates
  // whichever task is currently active).
  if (cache.activeTaskId) return { events: [], cache };

  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  const turnTaskId = `${sessionId}:turn:${timestamp}`;
  const turnTitle = summarize(prompt) || 'Untitled task';

  return {
    cache: { ...cache, turnTaskId, turnTitle },
    events: [
      {
        source: 'claude-code',
        sessionId,
        taskId: turnTaskId,
        title: turnTitle,
        status: 'thinking',
        filesTouched: [],
        timestamp,
      },
    ],
  };
}

function translateStop(sessionId: string, cache: SessionCache, timestamp: number): TranslateResult {
  const taskId = cache.activeTaskId ?? cache.turnTaskId;
  const title = cache.activeTaskId ? cache.activeTaskTitle : cache.turnTitle;
  if (!taskId || !title) return { events: [], cache };

  return {
    cache,
    events: [
      {
        source: 'claude-code',
        sessionId,
        taskId,
        title,
        status: 'waiting',
        filesTouched: [],
        timestamp,
      },
    ],
  };
}

function translatePostToolUse(
  sessionId: string,
  payload: Record<string, unknown>,
  cache: SessionCache,
  timestamp: number
): TranslateResult {
  const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : '';
  const toolInput = (payload.tool_input as Record<string, unknown>) ?? {};

  if (toolName === 'TodoWrite') {
    return translateTodoWrite(sessionId, toolInput, cache, timestamp);
  }

  const taskId = cache.activeTaskId ?? cache.turnTaskId;
  const title = cache.activeTaskId ? cache.activeTaskTitle : cache.turnTitle;
  if (!taskId || !title) return { events: [], cache };

  const fileField = FILE_TOOLS[toolName];
  const filePath = fileField ? toolInput[fileField] : undefined;
  const filesTouched = typeof filePath === 'string' ? [filePath] : [];

  let status: TaskStatus = 'thinking';
  if (fileField) {
    status = 'coding';
  } else if (toolName === 'Bash') {
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    status = TEST_COMMAND_PATTERNS.some((pattern) => pattern.test(command)) ? 'testing' : 'coding';
  }

  const toolResponse = payload.tool_response as Record<string, unknown> | undefined;
  const isError = Boolean(toolResponse?.error) || toolResponse?.is_error === true;

  return {
    cache,
    events: [
      {
        source: 'claude-code',
        sessionId,
        taskId,
        title,
        status: isError ? 'error' : status,
        filesTouched,
        timestamp,
      },
    ],
  };
}

interface TodoItem {
  content: string;
  status: string;
}

function translateTodoWrite(
  sessionId: string,
  toolInput: Record<string, unknown>,
  cache: SessionCache,
  timestamp: number
): TranslateResult {
  const todos = Array.isArray(toolInput.todos) ? (toolInput.todos as TodoItem[]) : [];

  const events: TaskEvent[] = todos
    .filter((todo) => typeof todo.content === 'string' && todo.content.length > 0)
    .map((todo) => ({
      source: 'claude-code',
      sessionId,
      taskId: slugId(sessionId, todo.content),
      title: todo.content,
      status: todoStatusToTaskStatus(todo.status),
      filesTouched: [],
      timestamp,
    }));

  const active = todos.find((todo) => todo.status === 'in_progress');
  const next: SessionCache = {
    ...cache,
    activeTaskId: active ? slugId(sessionId, active.content) : undefined,
    activeTaskTitle: active ? active.content : undefined,
  };

  return { events, cache: next };
}

function todoStatusToTaskStatus(status: string): TaskStatus {
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

// Not real summarization (no LLM call here) — the UserPromptSubmit hook
// blocks Claude Code from proceeding until it returns, so a synchronous
// LLM round-trip would add real latency to every single prompt. This is a
// fast, local, "good enough" cleanup: strip filler openers and cut at a
// word boundary instead of dumping the raw prompt truncated mid-word.
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

function slugId(sessionId: string, content: string): string {
  const hash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 10);
  return `${sessionId}:${hash}`;
}
