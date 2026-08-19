import { execFile } from 'node:child_process';
import type { Task } from '../types';

export interface CommitMessageOptions {
  style: 'conventional-commits' | 'freeform';
  maxSubjectLength: number;
}

interface MinimalLogger {
  warn(message: string): void;
}

/**
 * Reuses the already-authenticated `claude` CLI to write the commit
 * message — no separate API key needed out of the box. Falls back to a
 * plain deterministic template if the CLI isn't on PATH, times out, or
 * returns nothing usable, so approve-to-commit never hard-fails on this.
 */
export async function generateCommitMessage(
  task: Task,
  diff: string,
  options: CommitMessageOptions,
  logger: MinimalLogger
): Promise<string> {
  const prompt = buildPrompt(task, diff, options);
  try {
    return await runClaude(prompt);
  } catch (err) {
    logger.warn(
      `Falling back to a template commit message (claude -p unavailable: ${
        err instanceof Error ? err.message : String(err)
      })`
    );
    return fallbackMessage(task);
  }
}

export function buildPrompt(task: Task, diff: string, options: CommitMessageOptions): string {
  const styleInstructions =
    options.style === 'conventional-commits'
      ? 'Use the Conventional Commits format (e.g. "feat(scope): summary" or "fix: summary").'
      : 'Write a plain, imperative-mood summary line (no type/scope prefix).';

  return [
    'Generate a single git commit message for the change described below.',
    styleInstructions,
    `Keep the subject line under ${options.maxSubjectLength} characters.`,
    'Output ONLY the commit message text — no markdown code fences, no explanation, no surrounding quotes.',
    '',
    `Task: ${task.title}`,
    '',
    `Files changed:\n${task.filesTouched.map((f) => `- ${f}`).join('\n')}`,
    '',
    `Diff:\n${diff || '(no textual diff available)'}`,
  ].join('\n');
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p'],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        const cleaned = cleanMessage(stdout);
        if (!cleaned) {
          reject(new Error('empty response from claude -p'));
          return;
        }
        resolve(cleaned);
      }
    );
    child.stdin?.write(prompt);
    child.stdin?.end();
  });
}

export function cleanMessage(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function fallbackMessage(task: Task): string {
  const fileWord = task.filesTouched.length === 1 ? 'file' : 'files';
  return `Update ${task.filesTouched.length} ${fileWord}: ${task.title}`;
}
