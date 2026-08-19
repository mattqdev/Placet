import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

export interface TmpRepo {
  root: string;
  cleanup(): void;
}

/** A throwaway, initialized git repo under the OS tmpdir — for tests that need real git behavior. */
export function createTmpRepo(prefix = 'placet-test-'): TmpRepo {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@placet.dev'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Placet Test'], { cwd: root });
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export function writeFile(repo: TmpRepo, relativePath: string, content: string): void {
  const full = path.join(repo.root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function readFile(repo: TmpRepo, relativePath: string): string {
  return fs.readFileSync(path.join(repo.root, relativePath), 'utf8');
}

export function commitAll(repo: TmpRepo, message = 'initial'): void {
  execFileSync('git', ['add', '-A'], { cwd: repo.root });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: repo.root });
}

export function gitOutput(repo: TmpRepo, args: string[]): string {
  return execFileSync('git', args, { cwd: repo.root }).toString();
}
