import * as vscode from 'vscode';
import type { Task } from '../types';

const COMMIT_PUSH = 'Commit & Push';
const EDIT_MESSAGE = 'Edit message…';
const DONT_ASK_AGAIN = "Don't ask again (this workspace)";

/**
 * Approve-to-commit confirmation as a native modal dialog. The full diff is
 * no longer shown here — approveFlow already opened it in VS Code's native
 * multi-file diff editor before this dialog appears, so this is just the
 * lightweight "does the message look right" confirmation on top of it.
 */
export async function showApprovalPanel(
  task: Task,
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
  return [
    `${task.filesTouched.length} file${task.filesTouched.length === 1 ? '' : 's'} will be staged and committed — see the diff tab that just opened for the full review.`,
    '',
    'Commit message:',
    message,
  ].join('\n');
}
