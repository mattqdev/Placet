import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Logs to both the VS Code "Placet" Output channel (for the user, live) and
 * a plain file under .placet/placet.log (for tools/agents that can't see
 * VS Code's own UI panels, and to survive across window reloads).
 */
export class Logger {
  private readonly channel: vscode.LogOutputChannel;
  private readonly logFile: string;

  constructor(workspaceRoot: string) {
    this.channel = vscode.window.createOutputChannel('Placet', { log: true });
    const dir = path.join(workspaceRoot, '.placet');
    fs.mkdirSync(dir, { recursive: true });
    this.logFile = path.join(dir, 'placet.log');
  }

  info(message: string): void {
    this.channel.info(message);
    this.write('INFO', message);
  }

  warn(message: string): void {
    this.channel.warn(message);
    this.write('WARN', message);
  }

  error(message: string, err?: unknown): void {
    const detail =
      err instanceof Error ? `${message}: ${err.message}\n${err.stack ?? ''}` : message;
    this.channel.error(detail);
    this.write('ERROR', detail);
  }

  private write(level: string, message: string): void {
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    try {
      fs.appendFileSync(this.logFile, line);
    } catch {
      // Best-effort: the Output channel above already has it.
    }
  }

  dispose(): void {
    this.channel.dispose();
  }
}
