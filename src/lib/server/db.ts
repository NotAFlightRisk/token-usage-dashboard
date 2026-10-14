import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config';

/** Bump to throw away scanned rows and read every source file again. */
const SCHEMA = 2;

const META = 'create table if not exists meta (key text primary key, value text not null)';

const TABLES = `
create table if not exists events (
  id text primary key,
  tool text not null,
  model text not null,
  session text not null,
  project text not null,
  ts integer not null,
  day text not null,
  dow integer not null,
  hour integer not null,
  input integer not null default 0,
  output integer not null default 0,
  cache_read integer not null default 0,
  cache_write integer not null default 0,
  cache_write_long integer not null default 0,
  reasoning integer not null default 0,
  subagent integer
);
create index if not exists events_ts on events (ts);
create index if not exists events_day on events (day);
create table if not exists files (
  path text primary key,
  tool text not null,
  size integer not null,
  mtime integer not null,
  events integer not null default 0,
  scanned_at integer not null
);
create table if not exists names (
  tool text not null,
  session text not null,
  name text not null,
  primary key (tool, session)
);
create table if not exists windows (
  id text primary key,
  tool text not null,
  label text not null,
  used_percent real not null,
  window_minutes integer,
  resets_at integer,
  detail text not null default '',
  seen_at integer not null
);
`;

let handle: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (handle) return handle;

  mkdirSync(dirname(config.dbPath), { recursive: true });
  handle = new DatabaseSync(config.dbPath);
  handle.exec('pragma journal_mode = wal');
  handle.exec('pragma synchronous = normal');
  handle.exec(META);

  // the scanned tables go before they are recreated, or the new indexes hit the old columns
  if (readMeta('schema') !== String(SCHEMA)) {
    handle.exec('drop table if exists events; drop table if exists files');
    writeMeta('schema', String(SCHEMA));
  }
  handle.exec(TABLES);
  addColumns(handle);
  rebucket(handle);
  return handle;
}

const ADDED: Record<string, string> = {
  subagent: 'integer',
  cache_write_long: 'integer not null default 0'
};

/** Older databases grow columns in place, then every file is read again to fill them in */
function addColumns(handle: DatabaseSync): void {
  const columns = handle.prepare('pragma table_info(events)').all() as { name: string }[];
  const missing = Object.keys(ADDED).filter(
    (name) => !columns.some((column) => column.name === name)
  );
  if (!missing.length) return;
  const alters = missing.map((name) => `alter table events add column ${name} ${ADDED[name]};`);
  handle.exec(`begin; ${alters.join(' ')} delete from files; commit;`);
}

const REBUCKET = `
update events set
  day = date(ts / 1000, 'unixepoch', 'localtime'),
  dow = cast(strftime('%w', ts / 1000, 'unixepoch', 'localtime') as integer),
  hour = cast(strftime('%H', ts / 1000, 'unixepoch', 'localtime') as integer)
`;

/** Move the machine and every stored day is an hour or a date out, so redo them once. */
function rebucket(handle: DatabaseSync): void {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  if (readMeta('timezone') === zone) return;
  handle.exec(REBUCKET);
  writeMeta('timezone', zone);
}

export function readMeta(key: string): string | null {
  const row = db().prepare('select value from meta where key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function writeMeta(key: string, value: string): void {
  db()
    .prepare(
      'insert into meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value'
    )
    .run(key, value);
}
