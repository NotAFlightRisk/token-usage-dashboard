export type Event = {
  id: string;
  model: string;
  session: string;
  project: string;
  ts: number;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  cache_write_long?: number;
  reasoning: number;
  subagent?: boolean;
};

export type Window = {
  id: string;
  label: string;
  used_percent: number;
  window_minutes: number | null;
  resets_at: number | null;
  detail: string;
  seen_at: number;
};

export type Parsed = { events: Event[]; windows?: Window[]; names?: Record<string, string> };

export type Source = {
  id: string;
  label: string;
  root: string;
  ext: string;
  parse(path: string, text: string): Parsed;
};

/** Lines that can't be parsed are skipped: a half-written tail is normal, not a fault. */
export function* jsonLines(text: string, needle?: string): Generator<Record<string, unknown>> {
  for (const line of text.split('\n')) {
    if (line.length < 2 || (needle && !line.includes(needle))) continue;
    try {
      yield JSON.parse(line);
    } catch {
      continue;
    }
  }
}

export const num = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0);
