import { EventEmitter } from 'node:events';
import type { Task, TaskEvent } from '../types';

/**
 * Folds incoming TaskEvents (one per adapter tick) into a stable Task list,
 * keyed by taskId. filesTouched accumulates rather than replaces, since a
 * task's file set only grows until it's completed and reviewed.
 */
export class TaskStore {
  private readonly emitter = new EventEmitter();
  private readonly tasks = new Map<string, Task>();

  onDidChange(listener: () => void): { dispose(): void } {
    this.emitter.on('change', listener);
    return { dispose: () => this.emitter.off('change', listener) };
  }

  list(): Task[] {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  apply(event: TaskEvent): void {
    const existing = this.tasks.get(event.taskId);
    const filesTouched = existing
      ? [...new Set([...existing.filesTouched, ...event.filesTouched])]
      : [...event.filesTouched];

    const task: Task = {
      taskId: event.taskId,
      source: event.source,
      sessionId: event.sessionId,
      title: event.title || existing?.title || 'Untitled task',
      status: event.status,
      filesTouched,
      createdAt: existing?.createdAt ?? event.timestamp,
      updatedAt: event.timestamp,
      reviewed: existing?.reviewed ?? false,
    };

    this.tasks.set(event.taskId, task);
    this.emitter.emit('change');
  }

  markReviewed(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.reviewed = true;
    this.emitter.emit('change');
  }
}
