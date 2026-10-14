import { db, readMeta } from './db';
import { costOf, totalOf, type Rate, type Tokens } from '../pricing';
import type { DayPoint, Filters, SessionRow, Slice, Usage, WindowRow } from '../types';
import { scanState } from './scan';
import { problems } from './problems';
import { priceOverrides } from './settings';

type Row = Record<string, string | number | null>;

const empty = (): Tokens => ({
  input: 0,
  output: 0,
  cache_read: 0,
  cache_write: 0,
  cache_write_long: 0
});

const tokensOf = (row: Row): Tokens => ({
  input: Number(row.input) || 0,
  output: Number(row.output) || 0,
  cache_read: Number(row.cache_read) || 0,
  cache_write: Number(row.cache_write) || 0,
  cache_write_long: Number(row.cache_write_long) || 0
});

/** Adds what can be priced, so one unpriced model doesn't blank out the whole total */
const plus = (sum: number | null, cost: number | null) => (cost === null ? sum : (sum ?? 0) + cost);

function where(filters: Filters, dated = true) {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (dated) {
    clauses.push('ts >= ?', 'ts < ?');
    params.push(filters.from, filters.to);
  }
  for (const [column, values] of [
    ['tool', filters.tools],
    ['model', filters.models],
    ['project', filters.projects]
  ] as [string, string[]][]) {
    if (!values.length) continue;
    clauses.push(`${column} in (${values.map(() => '?').join(', ')})`);
    params.push(...values);
  }
  return { sql: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

const SUMS =
  'sum(input) input, sum(output) output, sum(cache_read) cache_read,' +
  ' sum(cache_write) cache_write, sum(cache_write_long) cache_write_long,' +
  ' sum(reasoning) reasoning, count(*) events,' +
  " count(distinct tool || ':' || session) sessions";

/** Rows arrive split by model so each slice can be priced at its own rate. */
function fold(rows: Row[], overrides: Record<string, Rate>): Map<string, Slice> {
  const slices = new Map<string, Slice>();
  const sessions = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = String(row.key ?? '');
    let slice = slices.get(key);
    if (!slice) {
      slice = { key, tokens: empty(), total: 0, reasoning: 0, cost: null, events: 0, sessions: 0 };
      slices.set(key, slice);
      sessions.set(key, new Set());
    }

    const tokens = tokensOf(row);
    for (const field of Object.keys(tokens) as (keyof Tokens)[])
      slice.tokens[field] += tokens[field];
    slice.total += totalOf(tokens);
    slice.reasoning += Number(row.reasoning) || 0;
    slice.events += Number(row.events) || 0;
    slice.sessions += Number(row.sessions) || 0;

    slice.cost = plus(slice.cost, costOf(String(row.model ?? ''), tokens, overrides));
  }
  return slices;
}

const blank = (key: string): Slice => ({
  key,
  tokens: empty(),
  total: 0,
  reasoning: 0,
  cost: 0,
  events: 0,
  sessions: 0
});

function grouped(column: string, filters: Filters, overrides: Record<string, Rate>): Slice[] {
  const clause = where(filters);
  const rows = db()
    .prepare(
      `select ${column} key, model, ${SUMS} from events ${clause.sql} group by ${column}, model`
    )
    .all(...clause.params) as Row[];
  return [...fold(rows, overrides).values()].sort((a, b) => b.total - a.total);
}

function totals(filters: Filters, overrides: Record<string, Rate>): Slice {
  const clause = where(filters);
  const rows = db()
    .prepare(`select '' key, model, ${SUMS} from events ${clause.sql} group by model`)
    .all(...clause.params) as Row[];
  const slice = fold(rows, overrides).get('') ?? blank('');

  const distinct = db()
    .prepare(`select count(distinct tool || ':' || session) sessions from events ${clause.sql}`)
    .get(...clause.params) as Row;
  slice.sessions = Number(distinct?.sessions) || 0;
  return slice;
}

function series(filters: Filters, column: string, overrides: Record<string, Rate>): DayPoint[] {
  const clause = where(filters);
  const rows = db()
    .prepare(
      `select day, ${column} key, model, ${SUMS} from events ${clause.sql}` +
        ` group by day, ${column}, model order by day`
    )
    .all(...clause.params) as Row[];

  const points = new Map<string, DayPoint>();
  for (const row of rows) {
    const id = `${row.day}|${row.key}`;
    const point = points.get(id) ?? {
      day: String(row.day),
      key: String(row.key ?? ''),
      total: 0,
      cost: null
    };
    const tokens = tokensOf(row);
    point.total += totalOf(tokens);
    point.cost = plus(point.cost, costOf(String(row.model ?? ''), tokens, overrides));
    points.set(id, point);
  }
  return [...points.values()];
}

/** The calendar ignores the date filter, since a year of squares is the whole point. */
function calendar(filters: Filters, overrides: Record<string, Rate>) {
  const clause = where(filters, false);
  const rows = db()
    .prepare(
      `select day, model, ${SUMS} from events ${clause.sql} group by day, model order by day`
    )
    .all(...clause.params) as Row[];

  const days = new Map<
    string,
    { day: string; total: number; cost: number | null; events: number }
  >();
  for (const row of rows) {
    const day = String(row.day);
    const entry = days.get(day) ?? { day, total: 0, cost: null, events: 0 };
    const tokens = tokensOf(row);
    entry.total += totalOf(tokens);
    entry.events += Number(row.events) || 0;
    entry.cost = plus(entry.cost, costOf(String(row.model ?? ''), tokens, overrides));
    days.set(day, entry);
  }
  return [...days.values()];
}

function clock(filters: Filters) {
  const clause = where(filters);
  const rows = db()
    .prepare(
      'select dow day, hour, sum(input + output + cache_read + cache_write) total' +
        ` from events ${clause.sql} group by dow, hour`
    )
    .all(...clause.params) as Row[];
  return rows.map((row) => ({
    day: Number(row.day),
    hour: Number(row.hour),
    total: Number(row.total) || 0
  }));
}

const SESSION_SUMS =
  'max(input + cache_read + cache_write) peak, count(subagent) flagged,' +
  ' sum(case when subagent = 1 then input + output + cache_read + cache_write end) side';

function sessions(filters: Filters, overrides: Record<string, Rate>, limit = 60): SessionRow[] {
  const clause = where(filters);
  const rows = db()
    .prepare(
      'select session key, tool, project, model, min(ts) started, max(ts) ended, ' +
        `${SUMS}, ${SESSION_SUMS} from events ${clause.sql} group by session, tool, project, model`
    )
    .all(...clause.params) as Row[];

  type Merged = Omit<SessionRow, 'name' | 'models' | 'cacheHit' | 'subagents'> & {
    models: Set<string>;
    read: number;
    fed: number;
    side: number | null;
  };
  const merged = new Map<string, Merged>();
  for (const row of rows) {
    const id = String(row.key);
    const at = `${row.tool}:${id}`;
    const entry: Merged = merged.get(at) ?? {
      id,
      tool: String(row.tool),
      project: String(row.project),
      models: new Set<string>(),
      started: Number(row.started),
      ended: Number(row.ended),
      total: 0,
      cost: null,
      peak: 0,
      turns: 0,
      read: 0,
      fed: 0,
      side: null
    };
    const tokens = tokensOf(row);
    entry.models.add(String(row.model));
    entry.started = Math.min(entry.started, Number(row.started));
    entry.ended = Math.max(entry.ended, Number(row.ended));
    entry.total += totalOf(tokens);
    entry.peak = Math.max(entry.peak, Number(row.peak) || 0);
    entry.turns += Number(row.events) || 0;
    entry.read += tokens.cache_read;
    entry.fed += tokens.input + tokens.cache_read + tokens.cache_write;
    if (Number(row.flagged)) entry.side = (entry.side ?? 0) + (Number(row.side) || 0);
    entry.cost = plus(entry.cost, costOf(String(row.model), tokens, overrides));
    merged.set(at, entry);
  }

  const name = db().prepare('select name from names where tool = ? and session = ?');
  return [...merged.values()]
    .sort((a, b) => b.ended - a.ended)
    .slice(0, limit)
    .map(({ models, read, fed, side, ...row }) => ({
      ...row,
      name: (name.get(row.tool, row.id) as { name: string } | undefined)?.name ?? null,
      models: [...models].sort().join(', '),
      cacheHit: fed ? read / fed : null,
      subagents: side === null || !row.total ? null : side / row.total
    }));
}

const distinct = (column: string) =>
  (db().prepare(`select distinct ${column} value from events order by value`).all() as Row[])
    .map((row) => String(row.value))
    .filter(Boolean);

const memo = new Map<string, Usage>();
let memoFor = -1;

/** One rollup per filter set per scan, since nothing under it can move in between. */
export const clearUsageMemo = () => memo.clear();

export function usage(filters: Filters): Usage {
  const { scannedAt } = scanState();
  if (scannedAt !== memoFor || memo.size > 32) {
    memo.clear();
    memoFor = scannedAt;
  }

  const key = JSON.stringify(filters);
  const hit = memo.get(key);
  if (hit) return { ...hit, problems: problems() };

  const fresh = rollup(filters);
  memo.set(key, fresh);
  return fresh;
}

function rollup(filters: Filters): Usage {
  const overrides = priceOverrides();
  const span = filters.to - filters.from;
  const previous = { ...filters, from: filters.from - span, to: filters.from };

  const byModel = grouped('model', filters, overrides);
  const oldest = (db().prepare('select min(ts) ts from events').get() as Row)?.ts;
  const state = scanState();

  return {
    generatedAt: Date.now(),
    filters,
    totals: totals(filters, overrides),
    previous: totals(previous, overrides),
    days: Math.max(1, Math.round(span / 86_400_000)),
    byTool: grouped('tool', filters, overrides),
    byModel,
    byProject: grouped('project', filters, overrides),
    series: series(filters, 'tool', overrides),
    seriesByModel: series(filters, 'model', overrides),
    calendar: calendar(filters, overrides),
    clock: clock(filters),
    sessions: sessions(filters, overrides),
    windows: db()
      .prepare('select * from windows order by window_minutes, tool')
      .all() as WindowRow[],
    options: { tools: distinct('tool'), models: distinct('model'), projects: distinct('project') },
    unpriced: byModel.filter((slice) => slice.cost === null).map((slice) => slice.key),
    sources: state.sources,
    scannedAt: Number(readMeta('scanned_at')) || state.scannedAt,
    oldest: oldest === null || oldest === undefined ? null : Number(oldest),
    problems: problems()
  };
}
