export type TaskSource = 'claude-code' | 'opencode';

export type TaskStatus =
  | 'thinking'
  | 'coding'
  | 'testing'
  | 'waiting'
  | 'completed'
  | 'error';

/** Normalized event any adapter can emit, regardless of which AI tool produced it. */
export interface TaskEvent {
  source: TaskSource;
  sessionId: string;
  taskId: string;
  title: string;
  status: TaskStatus;
  filesTouched: string[];
  timestamp: number;
  /**
   * Raw user prompt, set only on the turn-creation event. Used by the
   * extension host to synthesize a better title in the background — the
   * fast heuristic `title` above is what's shown immediately.
   */
  prompt?: string;
}

/** Accumulated view of a task, built by folding TaskEvents with the same taskId. */
export interface Task {
  taskId: string;
  source: TaskSource;
  sessionId: string;
  title: string;
  status: TaskStatus;
  filesTouched: string[];
  createdAt: number;
  updatedAt: number;
  reviewed: boolean;
}
