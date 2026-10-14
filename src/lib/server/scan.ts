import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { db, writeMeta } from './db';
import { SOURCES } from './sources';
import type { Source } from './sources/types';
import { describe, report, resolve } from './problems';

export type SourceStat = {
  id: string;
  label: string;
  root: string;
  present: boolean;
  files: number;
  events: number;
};

let running: Promise<SourceStat[]> | null = null;
let last: SourceStat[] = [];
let finishedAt = 0;

async function listFiles(source: Source): Promise<string[]> {
  const entries = await readdir(source.root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(source.ext))
    .map((entry) => join(entry.parentPath, entry.name));
}

const INSERT =
  'insert into events (id, tool, model, session, project, ts, day, dow, hour, input, output,' +
  ' cache_read, cache_write, cache_write_long, reasoning, subagent)' +
  ' values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)' +
  ' on conflict(id) do update set input = max(input, excluded.input),' +
  ' output = max(output, excluded.output), cache_read = max(cache_read, excluded.cache_read),' +
  ' cache_write = max(cache_write, excluded.cache_write),' +
  ' cache_write_long = max(cache_write_long, excluded.cache_write_long),' +
  ' reasoning = max(reasoning, excluded.reasoning),' +
  ' subagent = coalesce(excluded.subagent, subagent)';

const INSERT_NAME =
  'insert into names (tool, session, name) values (?, ?, ?)' +
  ' on conflict(tool, session) do update set name = excluded.name';

const INSERT_WINDOW =
  'insert into windows (id, tool, label, used_percent, window_minutes, resets_at, detail, seen_at)' +
  ' values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set' +
  ' used_percent = excluded.used_percent, resets_at = excluded.resets_at,' +
  ' detail = excluded.detail, seen_at = excluded.seen_at where excluded.seen_at >= windows.seen_at';

async function scanSource(source: Source): Promise<SourceStat> {
  const state: SourceStat = {
    id: source.id,
    label: source.label,
    root: source.root,
    present: true,
    files: 0,
    events: 0
  };

  let paths: string[];
  try {
    paths = await listFiles(source);
  } catch {
    state.present = false;
    return state;
  }

  const handle = db();
  const known = new Map(
    (
      handle
        .prepare('select path, size, mtime, events from files where tool = ?')
        .all(source.id) as { path: string; size: number; mtime: number; events: number }[]
    ).map((row) => [row.path, row])
  );
  const insert = handle.prepare(INSERT);
  const insertWindow = handle.prepare(INSERT_WINDOW);
  const insertName = handle.prepare(INSERT_NAME);
  const touch = handle.prepare(
    'insert into files (path, tool, size, mtime, events, scanned_at) values (?, ?, ?, ?, ?, ?)' +
      ' on conflict(path) do update set size = excluded.size, mtime = excluded.mtime,' +
      ' events = excluded.events, scanned_at = excluded.scanned_at'
  );

  let failures = 0;
  const now = Date.now();

  for (const path of paths) {
    state.files += 1;
    let size = 0;
    let mtime = 0;
    try {
      const info = await lstatOf(path);
      size = info.size;
      mtime = info.mtime;
    } catch {
      continue;
    }

    const cached = known.get(path);
    if (cached && cached.size === size && cached.mtime === mtime) {
      state.events += cached.events;
      continue;
    }

    try {
      const parsed = source.parse(path, await readFile(path, 'utf8'));
      handle.exec('begin');
      for (const event of parsed.events) {
        const at = new Date(event.ts);
        insert.run(
          event.id,
          source.id,
          event.model,
          event.session,
          event.project,
          event.ts,
          localDay(at),
          at.getDay(),
          at.getHours(),
          event.input,
          event.output,
          event.cache_read,
          event.cache_write,
          event.cache_write_long ?? 0,
          event.reasoning,
          event.subagent === undefined ? null : Number(event.subagent)
        );
      }
      for (const [session, name] of Object.entries(parsed.names ?? {})) {
        insertName.run(source.id, session, name);
      }
      for (const window of parsed.windows ?? []) {
        insertWindow.run(
          window.id,
          source.id,
          window.label,
          window.used_percent,
          window.window_minutes,
          window.resets_at,
          window.detail,
          window.seen_at
        );
      }
      touch.run(path, source.id, size, mtime, parsed.events.length, now);
      handle.exec('commit');
      state.events += parsed.events.length;
    } catch (error) {
      try {
        handle.exec('rollback');
      } catch {
        // a parse that fell over before `begin` has nothing open
      }
      failures += 1;
      if (failures === 1) {
        report({
          id: `scan:${source.id}`,
          level: 'warn',
          scope: source.label,
          message: `Could not read ${path}`,
          hint: describe(error)
        });
      }
    }
  }

  if (!failures) resolve(`scan:${source.id}`);
  if (state.files && !state.events) {
    report({
      id: `empty:${source.id}`,
      level: 'warn',
      scope: source.label,
      message: `Found ${state.files} files under ${source.root} but no usage in any of them`,
      hint: 'The format may have moved on. Open an issue with a sample and we will follow it.'
    });
  } else {
    resolve(`empty:${source.id}`);
  }
  return state;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local, not UTC, so a day on the calendar is the day the user had. */
export const localDay = (at: Date) =>
  `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

async function lstatOf(path: string) {
  const info = await stat(path);
  return { size: info.size, mtime: Math.round(info.mtimeMs) };
}

async function run(): Promise<SourceStat[]> {
  const stats: SourceStat[] = [];
  for (const source of SOURCES) stats.push(await scanSource(source));
  last = stats;
  finishedAt = Date.now();
  writeMeta('scanned_at', String(finishedAt));
  return stats;
}

/**
 * One scan at a time; a caller arriving mid-scan waits on the one already going. Rows are never
 * removed when their file goes: outliving the tools' own pruning is what the database is for.
 */
export function scan(): Promise<SourceStat[]> {
  if (!running) running = run().finally(() => (running = null));
  return running;
}

export const scanState = () => ({ sources: last, scannedAt: finishedAt, busy: running !== null });
