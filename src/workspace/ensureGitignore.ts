import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from '../logger';

/**
 * Placet writes machine-specific files (a live port + secret token, a
 * personal Claude Code hook config with an absolute path baked in) into
 * the *connected repo*, not just its own. Those must never end up in that
 * repo's git history — so on activation/connect we make sure the
 * workspace's own .gitignore covers them, creating the file if needed.
 */
export function ensureGitignoreEntry(
  workspaceRoot: string,
  entry: string,
  reason: string,
  logger: Logger
): void {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  let content = '';
  let existed = true;
  try {
    content = fs.readFileSync(gitignorePath, 'utf8');
  } catch {
    existed = false;
  }

  const normalized = entry.replace(/\/$/, '');
  const alreadyCovered = content
    .split(/\r?\n/)
    .some((line) => line.trim().replace(/\/$/, '') === normalized);
  if (alreadyCovered) return;

  const block = `# ${reason} — do not commit\n${entry}\n`;
  const separator = content.length === 0 ? '' : content.endsWith('\n') ? '\n' : '\n\n';

  fs.writeFileSync(gitignorePath, content + separator + block);
  logger.info(`${existed ? 'Updated' : 'Created'} .gitignore in ${workspaceRoot} to exclude "${entry}"`);
}
