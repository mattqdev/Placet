import * as vscode from 'vscode';
import { getDiffPreview, stageFiles, commit, push } from '../git/gitOps';
import { generateCommitMessage } from '../commit/generateMessage';
import { showApprovalPanel } from '../panel/approvalPanel';
import type { Task } from '../types';
import type { TaskStore } from '../server/taskStore';
import type { Logger } from '../logger';

/**
 * The 👍 flow: scope a diff to exactly the task's files, generate a commit
 * message, optionally confirm (diff + message preview, editable), then
 * stage + commit + push — never touching files outside task.filesTouched.
 */
export async function runApproveFlow(
  workspaceRoot: string,
  task: Task,
  store: TaskStore,
  logger: Logger
): Promise<void> {
  if (task.filesTouched.length === 0) return;

  try {
    const diff = await getDiffPreview(workspaceRoot, task.filesTouched);
    const config = vscode.workspace.getConfiguration('placet');
    const style = config.get<'conventional-commits' | 'freeform'>('commitMessageStyle', 'conventional-commits');
    const maxSubjectLength = config.get<number>('commitMessageMaxSubjectLength', 72);
    const message = await generateCommitMessage(task, diff, { style, maxSubjectLength }, logger);

    if (config.get<boolean>('requireConfirmation', true)) {
      showApprovalPanel(
        task,
        diff,
        message,
        (finalMessage) => {
          void commitAndPush(workspaceRoot, task, finalMessage, store, logger);
        },
        (value) => {
          void vscode.workspace
            .getConfiguration('placet')
            .update('requireConfirmation', value, vscode.ConfigurationTarget.Workspace);
        }
      );
    } else {
      await commitAndPush(workspaceRoot, task, message, store, logger);
    }
  } catch (err) {
    logger.error(`approve-to-commit failed for task "${task.title}"`, err);
    vscode.window.showErrorMessage(
      `Placet: approve-to-commit failed for "${task.title}" — see .placet/placet.log for details.`
    );
  }
}

async function commitAndPush(
  workspaceRoot: string,
  task: Task,
  message: string,
  store: TaskStore,
  logger: Logger
): Promise<void> {
  try {
    await stageFiles(workspaceRoot, task.filesTouched);
    await commit(workspaceRoot, message);
    store.markReviewed(task.taskId);
    logger.info(`Committed task "${task.title}" (${task.filesTouched.length} file(s))`);
  } catch (err) {
    logger.error(`commit failed for task "${task.title}"`, err);
    vscode.window.showErrorMessage(
      `Placet: commit failed for "${task.title}" — see .placet/placet.log for details.`
    );
    return;
  }

  const result = await push(workspaceRoot);
  if (result.ok) {
    vscode.window.showInformationMessage(`Placet: committed and pushed "${task.title}".`);
  } else {
    logger.warn(`Push failed for task "${task.title}": ${result.error}`);
    vscode.window.showWarningMessage(
      `Placet: committed "${task.title}" locally, but push failed — ${result.error}`
    );
  }
}
