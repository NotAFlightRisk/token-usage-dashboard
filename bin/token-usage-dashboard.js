#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// node:sqlite is still flagged experimental on Node 22 and the notice helps nobody here
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name !== 'ExperimentalWarning') console.warn(warning);
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const HELP = `
  aiusage ${pkg.version}

  Usage
    $ aiusage [options]

  Options
    -p, --port <n>    Port to listen on, or the next free one (default 4747)
    -h, --host <ip>   Address to bind (default 127.0.0.1)
        --db <path>   Where to keep the usage database
        --open        Open a browser once it is up
        --no-open     Never open a browser
    -v, --version     Print the version
        --help        Print this
`;

const args = process.argv.slice(2);
const flag = (...names) => args.some((arg) => names.includes(arg));
const value = (...names) => {
  const at = args.findIndex((arg) => names.includes(arg));
  return at === -1 ? null : args[at + 1];
};

if (flag('--help')) {
  console.log(HELP);
  process.exit(0);
}
if (flag('-v', '--version')) {
  console.log(pkg.version);
  process.exit(0);
}

const host = value('-h', '--host') ?? process.env.HOST ?? '127.0.0.1';
const asked = value('-p', '--port') ?? process.env.PORT ?? '4747';
const wanted = Number(asked);
const dbPath = value('--db');
if (dbPath) process.env.AIUSAGE_DB = dbPath;

if (!Number.isInteger(wanted) || wanted < 1 || wanted > 65535) {
  console.error(`${asked} is not a port. Pick a number between 1 and 65535.`);
  process.exit(1);
}

const free = (port) =>
  new Promise((done) => {
    const probe = createServer()
      .once('error', () => done(false))
      .once('listening', () => probe.close(() => done(true)))
      .listen(port, host);
  });

let port = wanted;
while (port <= Math.min(65535, wanted + 20) && !(await free(port))) port += 1;
if (port > Math.min(65535, wanted + 20)) {
  console.error(`Nothing free between ${wanted} and ${port - 1}. Try another with --port.`);
  process.exit(1);
}
if (port !== wanted) console.log(`Port ${wanted} was busy, using ${port}`);

process.env.HOST = host;
process.env.PORT = String(port);

const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
const url = `http://${shown.includes(':') ? `[${shown}]` : shown}:${port}`;
await import(resolve(root, 'build', 'index.js'));
console.log(`\n  Token usage dashboard is on ${url}\n`);

const wantsBrowser = flag('--open') || (process.stdout.isTTY && !flag('--no-open'));
if (wantsBrowser) {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(opener, [url], {
    stdio: 'ignore',
    detached: true,
    shell: process.platform === 'win32'
  }).unref();
}
