import { claudeCode } from './claude';
import { codex } from './codex';
import { opencode } from './opencode';
import type { Source } from './types';

export const SOURCES: Source[] = [claudeCode, codex, opencode];
