import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { Filters } from '../src/lib/types';

process.env.AIUSAGE_DB = join(mkdtempSync(join(tmpdir(), 'aiusage-')), 'usage.db');

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 9, 12, 0, 0);

let handle: DatabaseSync;
let usage: typeof import('../src/lib/server/queries').usage;
let localDay: typeof import('../src/lib/server/scan').localDay;

const add = (
  id: string,
  tool: string,
  model: string,
  project: string,
  daysAgo: number,
  tokens: number,
  session = `session-${id}`
) => {
  const at = new Date(now - daysAgo * DAY);
  handle
    .prepare(
      'insert into events (id, tool, model, session, project, ts, day, dow, hour, input, output,' +
        ' cache_read, cache_write, reasoning) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)'
    )
    .run(
      id,
      tool,
      model,
      session,
      project,
      at.getTime(),
      localDay(at),
      at.getDay(),
      at.getHours(),
      tokens
    );
};

const filters = (over: Partial<Filters> = {}): Filters => ({
  from: now - 7 * DAY,
  to: now + DAY,
  range: '7d',
  tools: [],
  models: [],
  projects: [],
  ...over
});

beforeAll(async () => {
  handle = (await import('../src/lib/server/db')).db();
  ({ usage } = await import('../src/lib/server/queries'));
  ({ localDay } = await import('../src/lib/server/scan'));

  add('a', 'claude-code', 'claude-opus-5', '/work/one', 1, 1_000_000);
  add('b', 'claude-code', 'claude-opus-5', '/work/two', 2, 2_000_000);
  add('c', 'codex', 'gpt-5.6-sol', '/work/one', 3, 4_000_000);
  add('d', 'codex', 'a-model-nobody-priced', '/work/one', 4, 8_000_000);
  add('old', 'claude-code', 'claude-opus-5', '/work/one', 40, 16_000_000);
});

describe('usage', () => {
  it('totals only what is inside the range', () => {
    const result = usage(filters());
    expect(result.totals.total).toBe(15_000_000);
    expect(result.totals.sessions).toBe(4);
  });

  it('adds up what it can price and names the model it cannot', () => {
    const result = usage(filters());
    expect(result.totals.cost).toBe(25);
    expect(result.byModel.find((slice) => slice.key === 'a-model-nobody-priced')?.cost).toBeNull();
    expect(result.unpriced).toEqual(['a-model-nobody-priced']);
  });

  it('narrows by every filter at once', () => {
    const result = usage(filters({ tools: ['codex'], projects: ['/work/one'] }));
    expect(result.totals.total).toBe(12_000_000);
    expect(result.byModel.map((slice) => slice.key).sort()).toEqual([
      'a-model-nobody-priced',
      'gpt-5.6-sol'
    ]);
  });

  it('compares against the window of the same length just before it', () => {
    const result = usage(filters({ from: now - 3 * DAY, to: now + DAY }));
    expect(result.totals.total).toBe(7_000_000);
    expect(result.previous.total).toBe(8_000_000);
  });

  it('draws the calendar from everything, whatever range is picked', () => {
    const result = usage(filters());
    const inCalendar = result.calendar.reduce((sum, day) => sum + day.total, 0);
    expect(inCalendar).toBe(31_000_000);
  });

  it('does not fold two tools into one session when neither wrote a session id', () => {
    add('blank-a', 'claude-code', 'claude-opus-5', '/work/one', 1, 5, '');
    add('blank-b', 'codex', 'gpt-5.6-sol', '/work/one', 1, 5, '');

    const result = usage(filters({ projects: ['/work/one'] }));
    expect(result.sessions.filter((row) => row.id === '')).toHaveLength(2);
    expect(result.totals.sessions).toBe(5);
  });

  it('works out peak context, cache hits and the subagent share per session', () => {
    const at = new Date(now - DAY);
    const insert = handle.prepare(
      'insert into events (id, tool, model, session, project, ts, day, dow, hour, input, output,' +
        ' cache_read, cache_write, reasoning, subagent)' +
        " values (?, 'claude-code', 'claude-opus-5', 'busy', '/work/agents', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
    );
    const place = [at.getTime(), localDay(at), at.getDay(), at.getHours()];
    insert.run('main', ...place, 10, 50, 600, 340, 0);
    insert.run('side', ...place, 100, 100, 200, 100, 1);
    handle.prepare("insert into names values ('claude-code', 'busy', 'maintain')").run();

    const [session] = usage(filters({ projects: ['/work/agents'] })).sessions;
    expect(session).toMatchObject({ name: 'maintain', peak: 950, turns: 2, total: 1500 });
    expect(session.cacheHit).toBeCloseTo(800 / 1350);
    expect(session.subagents).toBeCloseTo(500 / 1500);
  });

  it('prices the hour-long cache writes it stored at their own rate', () => {
    const at = new Date(now - DAY);
    handle
      .prepare(
        'insert into events (id, tool, model, session, project, ts, day, dow, hour, input,' +
          ' output, cache_read, cache_write, cache_write_long, reasoning)' +
          " values ('long', 'claude-code', 'claude-opus-5', 'long', '/work/cache', ?, ?, ?, ?," +
          ' 0, 0, 0, 1000000, 1000000, 0)'
      )
      .run(at.getTime(), localDay(at), at.getDay(), at.getHours());

    expect(usage(filters({ projects: ['/work/cache'] })).totals.cost).toBe(10);
  });

  it('leaves the subagent share blank for a tool that never says', () => {
    add('solo', 'codex', 'gpt-5.6-sol', '/work/solo', 1, 10);

    const [session] = usage(filters({ projects: ['/work/solo'] })).sessions;
    expect(session.subagents).toBeNull();
    expect(session.name).toBeNull();
  });

  it('keeps the project filter on the calendar', () => {
    const result = usage(filters({ projects: ['/work/two'] }));
    expect(result.calendar).toHaveLength(1);
    expect(result.calendar[0].total).toBe(2_000_000);
  });
});
