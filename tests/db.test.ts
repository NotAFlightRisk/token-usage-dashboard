import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

const path = join(mkdtempSync(join(tmpdir(), 'aiusage-')), 'usage.db');
process.env.AIUSAGE_DB = path;

it('adds new columns in place, keeping history and reading every file again', async () => {
  const old = new DatabaseSync(path);
  old.exec(`
    create table meta (key text primary key, value text not null);
    insert into meta values ('schema', '2');
    create table events (id text primary key, tool text, model text, session text,
      project text, ts integer, day text, dow integer, hour integer, input integer,
      output integer, cache_read integer, cache_write integer, reasoning integer);
    insert into events values ('gone', 'codex', 'm', 's', '/p', 1, '1970-01-01', 4, 1, 5, 0, 0, 0, 0);
    create table files (path text primary key, tool text, size integer, mtime integer,
      events integer, scanned_at integer);
    insert into files values ('/seen.jsonl', 'codex', 1, 1, 1, 1);
  `);
  old.close();

  const handle = (await import('../src/lib/server/db')).db();
  const columns = handle.prepare('pragma table_info(events)').all() as { name: string }[];

  expect(columns.map((column) => column.name)).toEqual(
    expect.arrayContaining(['subagent', 'cache_write_long'])
  );
  expect(handle.prepare('select count(*) n from events').get()).toEqual({ n: 1 });
  expect(handle.prepare('select count(*) n from files').get()).toEqual({ n: 0 });
});
