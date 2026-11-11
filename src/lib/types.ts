import type { Tokens } from './pricing';

export type Slice = {
  key: string;
  tokens: Tokens;
  total: number;
  reasoning: number;
  cost: number | null;
  events: number;
  sessions: number;
};

export type DayPoint = { day: string; key: string; total: number; cost: number | null };

export type SessionRow = {
  id: string;
  name: string | null;
  tool: string;
  project: string;
  models: string;
  started: number;
  ended: number;
  total: number;
  cost: number | null;
  peak: number;
  cacheHit: number | null;
  subagents: number | null;
  turns: number;
};

export type WindowRow = {
  id: string;
  tool: string;
  label: string;
  used_percent: number;
  window_minutes: number | null;
  resets_at: number | null;
  detail: string;
  seen_at: number;
};

export type Filters = {
  from: number;
  to: number;
  range: string;
  tools: string[];
  models: string[];
  projects: string[];
};

export type Usage = {
  generatedAt: number;
  filters: Filters;
  totals: Slice;
  previous: Slice;
  byTool: Slice[];
  byModel: Slice[];
  byProject: Slice[];
  series: DayPoint[];
  seriesByModel: DayPoint[];
  calendar: { day: string; total: number; cost: number | null; events: number }[];
  clock: { day: number; hour: number; total: number }[];
  sessions: SessionRow[];
  windows: WindowRow[];
  options: { tools: string[]; models: string[]; projects: string[] };
  unpriced: string[];
  sources: {
    id: string;
    label: string;
    root: string;
    present: boolean;
    files: number;
    events: number;
  }[];
  scannedAt: number;
  oldest: number | null;
  problems: {
    id: string;
    level: string;
    scope: string;
    message: string;
    hint: string;
    at: number;
  }[];
};
