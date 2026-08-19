import { execFile } from 'node:child_process';

/**
 * Shared low-level wrapper around the already-authenticated `claude` CLI —
 * reused by commit message generation and task title synthesis so both get
 * the same timeout/cleanup behavior without duplicating it.
 */
export function runClaudePrompt(prompt: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p'],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        const cleaned = cleanClaudeOutput(stdout);
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

export function cleanClaudeOutput(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}
