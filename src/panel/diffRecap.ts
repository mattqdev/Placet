import * as vscode from 'vscode';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Task } from '../types';
import { getFileStatuses } from '../git/gitOps';

const run = promisify(execFile);

export const PLACET_HEAD_SCHEME = 'placet-git-head';

/**
 * Serves a file's HEAD-committed content so it can sit on the "before" side
 * of VS Code's native diff editor — git itself has no URI scheme the diff
 * editor can read directly, so this is the bridge. The workspace root is
 * threaded through the URI's query since content providers are global and
 * otherwise have no way to know which repo a relative path belongs to.
 */
class GitHeadContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const workspaceRoot = uri.query;
    const relativePath = uri.path.replace(/^\//, '');
    try {
      const { stdout } = await run('git', ['show', `HEAD:${relativePath}`], {
        cwd: workspaceRoot,
        maxBuffer: 20 * 1024 * 1024,
      });
      return stdout;
    } catch {
      // No HEAD yet, or the path didn't exist at HEAD — render as empty
      // rather than failing the whole diff editor.
      return '';
    }
  }
}

export function registerGitHeadContentProvider(): vscode.Disposable {
  return vscode.workspace.registerTextDocumentContentProvider(PLACET_HEAD_SCHEME, new GitHeadContentProvider());
}

function headUri(workspaceRoot: string, relativePath: string): vscode.Uri {
  // Built field-by-field (not Uri.parse on a template string) so a path
  // containing '#' or '?' can't be misread as a fragment/query delimiter.
  return vscode.Uri.from({
    scheme: PLACET_HEAD_SCHEME,
    path: `/${relativePath}`,
    query: workspaceRoot,
  });
}

function workingUri(workspaceRoot: string, relativePath: string): vscode.Uri {
  return vscode.Uri.file(path.join(workspaceRoot, relativePath));
}

/**
 * Opens task.filesTouched in VS Code's native multi-file diff editor — the
 * same "Changes" view used to review a commit or a PR. One real, unified,
 * syntax-highlighted tab instead of a synthesized diff-text popup, and
 * nothing here needs to wait on git-diff text or an LLM call, so it opens
 * essentially instantly after the 👍 click.
 */
export async function openDiffRecap(workspaceRoot: string, task: Task): Promise<void> {
  if (task.filesTouched.length === 0) return;

  const statuses = await getFileStatuses(workspaceRoot, task.filesTouched);
  const kindByPath = new Map(statuses.map((s) => [s.path, s.kind]));

  const resources = task.filesTouched.map((file) => {
    const kind = kindByPath.get(file);
    const original = kind === 'added' || kind === 'untracked' ? undefined : headUri(workspaceRoot, file);
    const modified = kind === 'deleted' ? undefined : workingUri(workspaceRoot, file);
    return [workingUri(workspaceRoot, file), original, modified] as [
      vscode.Uri,
      vscode.Uri | undefined,
      vscode.Uri | undefined,
    ];
  });

  await vscode.commands.executeCommand('vscode.changes', `Placet — ${task.title}`, resources);
}
