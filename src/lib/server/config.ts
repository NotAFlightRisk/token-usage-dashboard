import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const home = homedir();
const env = (name: string, fallback: string) => (process.env[name] || '').trim() || fallback;

const dataHome = env('XDG_DATA_HOME', join(home, '.local', 'share'));
const dataDirs = ['token-usage-dashboard', 'ai-usage-dashboard'].map((name) =>
  join(dataHome, name)
);
const dataDir = dataDirs.find((dir) => existsSync(dir)) ?? dataDirs[0];

export const config = {
  dbPath: env('AIUSAGE_DB', join(dataDir, 'usage.db')),
  claudeDir: env('AIUSAGE_CLAUDE_DIR', join(home, '.claude')),
  codexDir: env('AIUSAGE_CODEX_DIR', join(home, '.codex')),
  openCodeDir: env('AIUSAGE_OPENCODE_DIR', join(dataHome, 'opencode'))
};
