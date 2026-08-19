import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The forwarder runs as a brand-new `node` process per hook invocation
 * (Claude Code spawns one per event), so it has no in-memory state across
 * calls. This tiny per-session file is how it remembers "which task is
 * currently active" (from the last TodoWrite) between one hook call and
 * the next.
 */
export interface SessionCache {
  turnTaskId?: string;
  turnTitle?: string;
  activeTaskId?: string;
  activeTaskTitle?: string;
}

function cachePath(workspaceRoot: string, sessionId: string): string {
  return path.join(workspaceRoot, '.placet', 'sessions', `${sessionId}.json`);
}

export function readSessionCache(workspaceRoot: string, sessionId: string): SessionCache {
  try {
    return JSON.parse(fs.readFileSync(cachePath(workspaceRoot, sessionId), 'utf8'));
  } catch {
    return {};
  }
}

export function writeSessionCache(
  workspaceRoot: string,
  sessionId: string,
  cache: SessionCache
): void {
  const file = cachePath(workspaceRoot, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cache, null, 2));
}
