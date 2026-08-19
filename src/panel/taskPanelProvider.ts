import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { Task, TaskStatus } from '../types';
import { TaskStore } from '../server/taskStore';

// Plain-text placeholders for now; swap for real codicons (via the webview
// codicon font asset) in the Phase 7 polish pass.
const STATUS_ICON: Record<TaskStatus, string> = {
  thinking: '💭',
  coding: '✏️',
  testing: '🧪',
  waiting: '⏳',
  completed: '✅',
  error: '⚠️',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  thinking: 'Thinking',
  coding: 'Writing code',
  testing: 'Testing',
  waiting: 'Waiting',
  completed: 'Completed',
  error: 'Error',
};

export class TaskPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'placet.taskPanel';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: TaskStore,
    private readonly onApprove: (task: Task) => void
  ) {
    this.store.onDidChange(() => this.render());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage((message: { type: string; taskId?: string }) => {
      if (message.type === 'approve' && message.taskId) {
        const task = this.store.get(message.taskId);
        if (task) this.onApprove(task);
      }
    });

    this.render();
  }

  private render(): void {
    if (!this.view) return;
    this.view.webview.html = this.buildHtml(this.store.list());
  }

  private buildHtml(tasks: Task[]): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const rows = tasks.length
      ? tasks.map((t) => this.taskRow(t)).join('\n')
      : `<p class="empty">No AI task detected yet. Run "Placet: Connect Claude Code" or "Placet: Connect opencode" from the Command Palette to get started.</p>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 4px 8px; }
  .empty { opacity: 0.7; line-height: 1.4; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 2px; border-bottom: 1px solid var(--vscode-widget-border, transparent); }
  .task-main { display: flex; flex-direction: column; min-width: 0; }
  .task-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .task-status { opacity: 0.75; font-size: 0.9em; }
  button.approve { border: none; background: transparent; cursor: pointer; opacity: 0.8; font-size: 1.1em; padding: 2px 6px; }
  button.approve:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); border-radius: 4px; }
  button.approve:disabled { opacity: 0.3; cursor: default; }
</style>
</head>
<body>
  <ul>${rows}</ul>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button.approve').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        vscode.postMessage({ type: 'approve', taskId: btn.dataset.taskId });
      });
    });
  </script>
</body>
</html>`;
  }

  private taskRow(task: Task): string {
    const icon = STATUS_ICON[task.status];
    const label = STATUS_LABEL[task.status];
    const disabled = task.filesTouched.length === 0 ? 'disabled' : '';
    const title = escapeHtml(task.title);
    return `<li>
  <div class="task-main">
    <span class="task-title" title="${title}">${title}</span>
    <span class="task-status">${icon} ${label} · ${task.filesTouched.length} file${task.filesTouched.length === 1 ? '' : 's'}</span>
  </div>
  <button class="approve" data-task-id="${escapeHtml(task.taskId)}" ${disabled} title="Approve: stage + commit only this task's files">👍</button>
</li>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
