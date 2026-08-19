import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TaskStore } from './server/taskStore';
import { LocalServer } from './server/localServer';
import { TaskPanelProvider } from './panel/taskPanelProvider';
import { Logger } from './logger';
import { ensureGitignoreEntry } from './workspace/ensureGitignore';
import { connectClaudeCode } from './adapters/claudeCode/installer';
import { connectOpencode } from './adapters/opencode/installer';
import { runApproveFlow } from './approve/approveFlow';
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

  // .placet/ holds a live port + secret token (server.json) and our log
  // file — this repo's own .gitignore has no reason to know about Placet,
  // so we make sure it's covered here rather than asking the user to do it.
  ensureGitignoreEntry(
    workspaceRoot,
    '.placet/',
    'Placet local server discovery file (port + secret token)',
    logger
  );

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
    void runApproveFlow(workspaceRoot, task, store, logger);
  };

  const panelProvider = new TaskPanelProvider(context.extensionUri, store, onApprove);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TaskPanelProvider.viewId, panelProvider),
    vscode.window.registerWebviewViewProvider(TaskPanelProvider.scmViewId, panelProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('placet.connectClaudeCode', async () => {
      try {
        const forwarderPath = context.asAbsolutePath(path.join('dist', 'forwarder.js'));
        if (!fs.existsSync(forwarderPath)) {
          throw new Error(`forwarder bundle not found at ${forwarderPath} — run "npm run compile"`);
        }
        connectClaudeCode(workspaceRoot, forwarderPath, logger);
        vscode.window.showInformationMessage(
          'Placet: Claude Code hooks installed in .claude/settings.local.json. Start a new Claude Code session in this project for them to take effect.'
        );
      } catch (err) {
        logger.error('placet.connectClaudeCode failed', err);
        vscode.window.showErrorMessage(
          'Placet: failed to connect Claude Code — see .placet/placet.log for details.'
        );
      }
    }),
    vscode.commands.registerCommand('placet.connectOpencode', async () => {
      try {
        const pluginTemplatePath = context.asAbsolutePath(
          path.join('resources', 'opencode', 'placet-plugin.ts')
        );
        if (!fs.existsSync(pluginTemplatePath)) {
          throw new Error(`plugin template not found at ${pluginTemplatePath}`);
        }
        connectOpencode(workspaceRoot, pluginTemplatePath, logger);
        vscode.window.showInformationMessage(
          'Placet: opencode plugin installed at .opencode/plugin/placet.ts. Start a new opencode session in this project for it to take effect.'
        );
      } catch (err) {
        logger.error('placet.connectOpencode failed', err);
        vscode.window.showErrorMessage(
          'Placet: failed to connect opencode — see .placet/placet.log for details.'
        );
      }
    })
  );

  logger.info('Placet activated');
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions disposables.
}
