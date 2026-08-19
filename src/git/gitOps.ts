import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const run = promisify(execFile);
const MAX_DIFF_CHARS = 8000;

export type FileStatusKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'other';

export interface FileStatus {
  path: string;
  kind: FileStatusKind;
}

// Never `-A` / bare paths from user input concatenated into a shell string —
// always argv arrays via execFile, and always scoped to the exact files a
// task touched.

export async function getFileStatuses(workspaceRoot: string, files: string[]): Promise<FileStatus[]> {
  if (files.length === 0) return [];
  try {
    const { stdout } = await run('git', ['status', '--porcelain', '--', ...files], { cwd: workspaceRoot });
    return stdout
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => ({ path: line.slice(3), kind: classify(line.slice(0, 2)) }));
  } catch {
    return files.map((file) => ({ path: file, kind: 'other' as const }));
  }
}

function classify(code: string): FileStatusKind {
  if (code.includes('?')) return 'untracked';
  if (code.includes('A')) return 'added';
  if (code.includes('D')) return 'deleted';
  if (code.includes('R')) return 'renamed';
  if (code.includes('M')) return 'modified';
  return 'other';
}

/**
 * A diff preview scoped to exactly `files`, relative to HEAD (so it's
 * accurate regardless of whether the files happen to already be staged).
 * Untracked files show no HEAD diff at all, so those are rendered as
 * synthetic "new file" additions from their current on-disk content.
 */
export async function getDiffPreview(workspaceRoot: string, files: string[]): Promise<string> {
  if (files.length === 0) return '';

  let diff = await tryDiff(workspaceRoot, ['diff', '--no-color', 'HEAD', '--', ...files]);
  if (diff === undefined) {
    // No HEAD yet (brand-new repo) — fall back to a plain working-tree diff.
    diff = (await tryDiff(workspaceRoot, ['diff', '--no-color', '--', ...files])) ?? '';
  }

  const statuses = await getFileStatuses(workspaceRoot, files);
  const untrackedChunks = statuses
    .filter((s) => s.kind === 'untracked')
    .map((s) => renderNewFile(workspaceRoot, s.path));

  const combined = [diff, ...untrackedChunks].filter(Boolean).join('\n\n');

  if (combined.length > MAX_DIFF_CHARS) {
    return `${combined.slice(0, MAX_DIFF_CHARS)}\n\n… (diff truncated, ${
      combined.length - MAX_DIFF_CHARS
    } more characters)`;
  }
  return combined;
}

async function tryDiff(workspaceRoot: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', args, { cwd: workspaceRoot, maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } catch {
    return undefined;
  }
}

function renderNewFile(workspaceRoot: string, relativePath: string): string {
  try {
    const content = fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
    const body = content
      .split('\n')
      .map((line) => `+${line}`)
      .join('\n');
    return `--- /dev/null\n+++ ${relativePath}\n${body}`;
  } catch {
    return `--- /dev/null\n+++ ${relativePath}\n(binary or unreadable file)`;
  }
}

export async function stageFiles(workspaceRoot: string, files: string[]): Promise<void> {
  if (files.length === 0) return;
  await run('git', ['add', '--', ...files], { cwd: workspaceRoot });
}

export async function commit(workspaceRoot: string, message: string): Promise<void> {
  const tmpFile = path.join(os.tmpdir(), `placet-commit-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(tmpFile, message, 'utf8');
  try {
    await run('git', ['commit', '-F', tmpFile], { cwd: workspaceRoot });
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

export interface PushResult {
  ok: boolean;
  error?: string;
}

export async function push(workspaceRoot: string): Promise<PushResult> {
  try {
    await run('git', ['push'], { cwd: workspaceRoot });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
