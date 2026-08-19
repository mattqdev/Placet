import * as vscode from 'vscode';
import { TaskStore } from './server/taskStore';
import { LocalServer } from './server/localServer';
import { TaskPanelProvider } from './panel/taskPanelProvider';
import { Logger } from './logger';
import type { Task } from './types';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    // No adapters can be connected without a workspace folder to write
    // .claude/settings.json or .opencode/plugin/ into.
    return;
  }

  const logger = new Logger(workspaceRoot);
  context.subscriptions.push(logger);
  logger.info('Placet activating...');

  const store = new TaskStore();
  const server = new LocalServer(workspaceRoot, store, logger);
  try {
    await server.start();
  } catch (err) {
    logger.error('Failed to start local server', err);
    return;
  }
  context.subscriptions.push({ dispose: () => server.dispose() });

  const onApprove = (task: Task) => {
    // TODO(Phase 5): scoped diff + confirmation webview + commit/push.
    vscode.window.showInformationMessage(
      `Placet: approve-to-commit for "${task.title}" isn't wired up yet (${task.filesTouched.length} file(s) touched).`
    );
  };

  const panelProvider = new TaskPanelProvider(context.extensionUri, store, onApprove);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TaskPanelProvider.viewId, panelProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('placet.connectClaudeCode', async () => {
      // TODO(Phase 3): write hooks into .claude/settings.json pointing at a
      // bundled forwarder script that POSTs to the LocalServer.
      logger.info('placet.connectClaudeCode invoked (not implemented yet)');
      vscode.window.showInformationMessage('Placet: Claude Code adapter is not implemented yet.');
    }),
    vscode.commands.registerCommand('placet.connectOpencode', async () => {
      // TODO(Phase 4): write .opencode/plugin/placet.ts.
      logger.info('placet.connectOpencode invoked (not implemented yet)');
      vscode.window.showInformationMessage('Placet: opencode adapter is not implemented yet.');
    })
  );

  logger.info('Placet activated');
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions disposables.
}
