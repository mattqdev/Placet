import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Logger } from '../../logger';

/**
 * Copies Placet's opencode plugin template verbatim into
 * <project>/.opencode/plugin/placet.ts. Unlike the Claude Code hook config,
 * this file has no machine-specific paths baked in, so it's fine (even
 * encouraged) to commit it — every teammate running opencode in this repo
 * gets Placet tracking for free, no per-machine setup needed.
 */
export function connectOpencode(workspaceRoot: string, pluginTemplatePath: string, logger: Logger): void {
  const targetPath = path.join(workspaceRoot, '.opencode', 'plugin', 'placet.ts');
  const content = fs.readFileSync(pluginTemplatePath, 'utf8');

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);

  logger.info(`Wrote opencode plugin to ${targetPath}`);
}
