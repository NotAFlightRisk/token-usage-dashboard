<h1 align="center">Token usage dashboard</h1>
<p align="center">
<i>Beautiful dashboard showing a breakdown of where all of your tokens are going</i><br>
<b><code>npx token-usage-dashboard</code></b>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/NotAFlightRisk/token-usage-dashboard/main/.github/screenshot.png" width="800" alt="The dashboard, showing a usage calendar, daily totals and plan windows" />
</p>

---

## About

Ever wondered where all your tokens are going? Or how much your AI usage is valued at?
This usage dashboard reads your local Claude Code, Codex and OpenCode transcripts and builds a beautiful dashboard breaking down your full historical usage.

Everything happens locally, so your transcripts never leave your device.
Stats are cached in a local SQLite DB, so that you get full history even after Claude and Codex have pruned old transcripts.
Cost estimates come from current published API rates.

The dashboard shows:

- a calendar heatmap of the past year
- daily totals, stacked by tool or model
- the split between fresh input, output, cache reads and cache writes
- which projects, AI providers and models your tokens went to
- Anthropic and OpenAI 5-hour and 7-day windows
- your recent sessions, with full token usage breakdown

---

## Usage

```shell
npx token-usage-dashboard
```

That's it. It finds your transcripts, reads them, and opens on
[localhost:4747](http://localhost:4747). Install it globally and the command is just `aiusage`.
Nothing leaves the machine except the one call to Anthropic for your plan windows, which you can
turn off in settings.

| Flag                   | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `-p, --port <n>`       | Port to listen on, or the next free one after it |
| `-h, --host <ip>`      | Address to bind, `127.0.0.1` by default          |
| `--db <path>`          | Where to keep the history                        |
| `--open` / `--no-open` | Whether to open a browser                        |

---

## Configuration

Most of it lives behind the gear icon: theme, default range, how often to rescan, whether to ask
Anthropic for your plan windows, and price overrides for any model we've got wrong or don't know.

Paths are environment variables, since they're needed before the app starts. See
[`.env.example`](https://github.com/NotAFlightRisk/token-usage-dashboard/blob/main/.env.example) for the full list. The ones you'll actually want are
`AIUSAGE_DB`, `AIUSAGE_CLAUDE_DIR` and `AIUSAGE_CODEX_DIR`.

---

## Supported tools

| Tool        | Where it reads                                                 |
| ----------- | -------------------------------------------------------------- |
| Claude Code | `~/.claude/projects/**/*.jsonl`, subagent transcripts included |
| Codex       | `~/.codex/sessions/**/*.jsonl`                                 |
| OpenCode    | `~/.local/share/opencode/storage/message`                      |

Adding another is one file in `src/lib/server/sources/`. If a tool writes token counts somewhere
we can read, it can go in - open an issue with a sample and we'll have a look.

---

## Deployment

### Option 1: Docker

The image is on DockerHub ([`notaflightrisk/token-usage-dashboard`](https://hub.docker.com/r/notaflightrisk/token-usage-dashboard))
and GHCR. Mount the directories you want read, plus somewhere to keep the database:

```shell
docker run -p 127.0.0.1:8080:8080 \
  -v ~/.claude:/home/node/.claude:ro \
  -v ~/.codex:/home/node/.codex:ro \
  -v token-usage:/data \
  notaflightrisk/token-usage-dashboard
```

There's a compose file in [`docker/`](https://github.com/NotAFlightRisk/token-usage-dashboard/blob/main/docker/compose.yaml) if you'd rather. The container has
to bind `0.0.0.0` internally, so publish the port to localhost like that unless something in
front of it is checking who's asking.

### Option 2: A local service

There's a systemd user unit in `scripts/`. `scripts/install.sh` fills in the paths and starts it,
so it comes back after a reboot:

```shell
./scripts/install.sh 4747
```

### Option 3: From a release

Grab the tarball from [releases](https://github.com/NotAFlightRisk/token-usage-dashboard/releases),
then `npm ci --omit=dev && npm start`.

### Option 4: From source

Follow [Development](#development) below, then `npm run build && npm start`.

---

## Development

You'll need [Node](https://nodejs.org/) 22.17 or newer, plus [Git](https://git-scm.com/).
It's a [SvelteKit](https://svelte.dev/docs/kit) app and the build is self-contained so there's no runtime dependencies at all.

```bash
git clone git@github.com:NotAFlightRisk/token-usage-dashboard.git
cd token-usage-dashboard
npm install
npm run dev
```

The dev server is then on [localhost:5173](http://localhost:5173).
The other scripts you'll want are `npm run check` (types), `npm test` (tests) and `npm run format` (prettier).

---

<!-- License + Copyright -->
<p  align="center">
  <a href="https://github.com/NotAFlightRisk"><img width="64" src="https://pixelflare.cc/iain/gif/penguin-dance.gif" /></a><br>
  <sup>
    <i>Licensed under <a href="https://github.com/NotAFlightRisk/token-usage-dashboard/blob/main/LICENSE">MIT</a>, © <a href="https://peng.ly">NotAFlightRisk</a> 2026</i>
  </sup>
</p>
