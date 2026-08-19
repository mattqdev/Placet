import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { Task } from '../types';

interface WebviewMessage {
  type: 'confirm' | 'cancel' | 'toggleRequireConfirmation';
  message?: string;
  value?: boolean;
}

export function showApprovalPanel(
  task: Task,
  diff: string,
  initialMessage: string,
  onConfirm: (finalMessage: string) => void,
  onToggleRequireConfirmation: (requireConfirmation: boolean) => void
): void {
  const panel = vscode.window.createWebviewPanel(
    'placet.approve',
    `Placet: Approve "${task.title}"`,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: false }
  );

  panel.webview.html = buildHtml(task, diff, initialMessage);

  panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
    switch (message.type) {
      case 'confirm':
        onConfirm(message.message ?? initialMessage);
        panel.dispose();
        break;
      case 'cancel':
        panel.dispose();
        break;
      case 'toggleRequireConfirmation':
        if (typeof message.value === 'boolean') onToggleRequireConfirmation(message.value);
        break;
    }
  });
}

function buildHtml(task: Task, diff: string, initialMessage: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const fileList = task.filesTouched.map((f) => `<li>${escapeHtml(f)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px 20px; max-width: 900px; }
  h2 { font-size: 1.15em; margin: 0 0 4px; }
  .subtitle { opacity: 0.7; font-size: 0.85em; margin-bottom: 12px; }
  ul.files { margin: 4px 0 16px; padding-left: 20px; font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
  h3 { font-size: 0.9em; text-transform: uppercase; opacity: 0.7; margin: 16px 0 6px; letter-spacing: 0.04em; }
  pre.diff { background: var(--vscode-textCodeBlock-background); padding: 10px; overflow-x: auto; overflow-y: auto; max-height: 320px; font-family: var(--vscode-editor-font-family); font-size: 0.85em; white-space: pre; border-radius: 4px; }
  textarea { width: 100%; box-sizing: border-box; font-family: var(--vscode-editor-font-family); font-size: 0.95em; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; min-height: 90px; resize: vertical; }
  .actions { margin-top: 14px; display: flex; gap: 8px; align-items: center; }
  button { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.95em; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  label.toggle { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 0.85em; opacity: 0.85; cursor: pointer; }
</style>
</head>
<body>
  <h2>${escapeHtml(task.title)}</h2>
  <div class="subtitle">${task.filesTouched.length} file${task.filesTouched.length === 1 ? '' : 's'} will be staged and committed — nothing else in the working tree is touched.</div>

  <h3>Files</h3>
  <ul class="files">${fileList}</ul>

  <h3>Diff</h3>
  <pre class="diff">${escapeHtml(diff || '(no diff available)')}</pre>

  <h3>Commit message</h3>
  <textarea id="message">${escapeHtml(initialMessage)}</textarea>

  <div class="actions">
    <button class="primary" id="confirm">Commit &amp; Push</button>
    <button class="secondary" id="cancel">Cancel</button>
    <label class="toggle"><input type="checkbox" id="skipConfirm" /> Don't ask again in this workspace</label>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('confirm').addEventListener('click', () => {
      vscode.postMessage({ type: 'confirm', message: document.getElementById('message').value });
    });
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
    document.getElementById('skipConfirm').addEventListener('change', (event) => {
      vscode.postMessage({ type: 'toggleRequireConfirmation', value: !event.target.checked });
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
