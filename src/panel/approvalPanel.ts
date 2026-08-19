import * as vscode from 'vscode';
import type { Task } from '../types';

const COMMIT_PUSH = 'Commit & Push';
const EDIT_MESSAGE = 'Edit message…';
const VIEW_DIFF = 'View diff';
const DONT_ASK_AGAIN = "Don't ask again (this workspace)";

/**
 * Approve-to-commit confirmation as a real native modal dialog rather than
 * a webview panel (which always renders as an editor tab, not a popup).
 * The trade-off: no inline syntax-highlighted diff or textarea in the same
 * surface — "View diff" opens the diff in a separate editor instead, and
 * editing the message uses a dedicated input box.
 */
export async function showApprovalPanel(
  task: Task,
  diff: string,
  initialMessage: string,
  onConfirm: (finalMessage: string) => void,
  onToggleRequireConfirmation: (requireConfirmation: boolean) => void
): Promise<void> {
  let message = initialMessage;

  for (;;) {
    const choice = await vscode.window.showInformationMessage(
      `Placet — Approve "${task.title}"`,
      { modal: true, detail: buildDetail(task, message) },
      COMMIT_PUSH,
      EDIT_MESSAGE,
      VIEW_DIFF,
      DONT_ASK_AGAIN
    );

    switch (choice) {
      case COMMIT_PUSH:
        onConfirm(message);
        return;
      case EDIT_MESSAGE: {
        const edited = await vscode.window.showInputBox({
          title: `Placet — commit message for "${task.title}"`,
          value: message,
          prompt: 'Edit the commit message, then confirm in the dialog to commit & push.',
        });
        if (edited !== undefined && edited.trim()) message = edited;
        break;
      }
      case VIEW_DIFF:
        await openDiffDocument(diff);
        break;
      case DONT_ASK_AGAIN:
        onToggleRequireConfirmation(false);
        onConfirm(message);
        return;
      default:
        // Dismissed (Escape / close) — cancel, nothing committed.
        return;
    }
  }
}

function buildDetail(task: Task, message: string): string {
  const fileList = task.filesTouched.map((f) => `  • ${f}`).join('\n');
  return [
    `${task.filesTouched.length} file${task.filesTouched.length === 1 ? '' : 's'} will be staged and committed — nothing else in the working tree is touched:`,
    fileList,
    '',
    'Commit message:',
    message,
  ].join('\n');
}

async function openDiffDocument(diff: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: diff || '(no diff available)',
    language: 'diff',
  });
  await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Active });
}
