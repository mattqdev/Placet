import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from '../../logger';
import { ensureGitignoreEntry } from '../../workspace/ensureGitignore';

interface ClaudeHookEntry {
  type: 'command';
  command: string;
}

interface ClaudeHookMatcher {
  matcher?: string;
  hooks: ClaudeHookEntry[];
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookMatcher[]>;
  [key: string]: unknown;
}

const HOOK_EVENTS: Array<{ name: string; matcher?: string }> = [
  { name: 'UserPromptSubmit' },
  { name: 'PostToolUse', matcher: '*' },
  { name: 'Stop' },
];

/**
 * Writes the hooks Placet needs into .claude/settings.local.json (the
 * personal, per-machine settings file — NOT settings.json, since the
 * hook command embeds an absolute, machine-specific path to this
 * extension's bundled forwarder script and would break for teammates).
 * Idempotent: re-running updates the command path instead of duplicating.
 */
export function connectClaudeCode(workspaceRoot: string, forwarderPath: string, logger: Logger): void {
  const settingsPath = path.join(workspaceRoot, '.claude', 'settings.local.json');

  let settings: ClaudeSettings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    // No existing file, or invalid JSON — start fresh; we only ever add keys.
  }

  settings.hooks ??= {};

  for (const { name, matcher } of HOOK_EVENTS) {
    const command = buildCommand(forwarderPath, name);
    const matchers = (settings.hooks[name] ??= []);

    const existing = matchers.find((m) => m.hooks.some((h) => h.command.includes(forwarderPath)));
    if (existing) {
      existing.hooks = [{ type: 'command', command }];
      if (matcher !== undefined) existing.matcher = matcher;
    } else {
      matchers.push(
        matcher !== undefined
          ? { matcher, hooks: [{ type: 'command', command }] }
          : { hooks: [{ type: 'command', command }] }
      );
    }
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

  ensureGitignoreEntry(
    workspaceRoot,
    '.claude/settings.local.json',
    'Placet Claude Code hooks (personal, embeds an absolute path)',
    logger
  );

  logger.info(`Wrote Claude Code hooks to ${settingsPath}`);
}

function buildCommand(forwarderPath: string, hookEventName: string): string {
  // JSON.stringify doubles as simple double-quoting here; doesn't handle
  // Windows path/shell quoting rules — fine for the v1 macOS/Linux target.
  return `node ${JSON.stringify(forwarderPath)} ${hookEventName}`;
}
