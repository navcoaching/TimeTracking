export type ProjectStatus = 'new' | 'active' | 'paused' | 'completed';

export interface Project {
  id: string;
  name: string;
  client?: string;
  description?: string;
  startDate: string; // ISO date (YYYY-MM-DD)
  status: ProjectStatus;
  hourlyRate: number; // SAR, applies to new sessions
  notes?: string;
  archived: boolean;
  /** Pricing tool inputs (per project) */
  pricing?: {
    marginPercent: number;
    extraCosts: number;
    discount: number;
    /** Final price the user decided to quote the client (optional override) */
    finalPrice?: number;
  };
  createdAt: number; // epoch ms
  updatedAt: number;
}

export interface PauseInterval {
  start: number; // epoch ms
  end: number; // epoch ms
}

export interface WorkSession {
  id: string;
  projectId: string;
  startedAt: number; // epoch ms — actual wall-clock start
  endedAt: number; // epoch ms — actual wall-clock end
  pauses: PauseInterval[];
  /** Counted seconds = (endedAt - startedAt - total pause) / 1000, stored for queries */
  durationSeconds: number;
  /** Rate locked in when the session was recorded */
  hourlyRate: number;
  cost: number; // SAR
  note?: string;
  taskType?: string;
  /** 'timer' = recorded by the live timer, 'manual' = entered by hand */
  source: 'timer' | 'manual';
  manuallyEdited: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TimerStatus = 'running' | 'paused';

/** Persisted state of the single active timer (at most one app-wide) */
export interface ActiveTimer {
  id: 'active'; // singleton key
  projectId: string;
  startedAt: number;
  status: TimerStatus;
  /** Completed pause intervals */
  pauses: PauseInterval[];
  /** If status === 'paused', when the current pause started */
  pausedAt?: number;
  note?: string;
  taskType?: string;
  hourlyRate: number;
}

export interface Settings {
  id: 'settings';
  defaultHourlyRate: number;
  currency: 'SAR';
  theme: 'system' | 'light' | 'dark';
  language: 'ar';
  taskTypes: string[];
}

export interface BackupFile {
  app: 'waqti';
  schemaVersion: number;
  exportedAt: string;
  projects: Project[];
  sessions: WorkSession[];
  settings: Settings;
  activeTimer: ActiveTimer | null;
}
