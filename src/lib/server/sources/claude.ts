import { join } from 'node:path';
import { config } from '../config';
import { jsonLines, num, type Event, type Parsed, type Source } from './types';

type Usage = Record<string, number | Record<string, number>>;

/**
 * A streaming message is rewritten in place under one `message.id`, so the caller keeps the
 * highest value it has seen per field. Session comes off the line, never the filename, or a
 * subagent's tokens land under the wrong session.
 */
export const claudeCode: Source = {
  id: 'claude-code',
  label: 'Claude Code',
  root: join(config.claudeDir, 'projects'),
  ext: '.jsonl',

  parse(path, text): Parsed {
    const events: Event[] = [];

    for (const line of jsonLines(text, '"usage"')) {
      const message = line.message as { id?: string; model?: string; usage?: Usage } | undefined;
      const usage = message?.usage;
      if (line.type !== 'assistant' || !usage || !message.id || !message.model) continue;
      if (message.model.startsWith('<')) continue;

      const ts = Date.parse(String(line.timestamp));
      if (Number.isNaN(ts)) continue;

      const details = usage.output_tokens_details as Record<string, number> | undefined;
      const written = usage.cache_creation as Record<string, number> | undefined;
      events.push({
        id: `claude-code:${message.id}`,
        model: message.model,
        session: String(line.sessionId || line.session_id || ''),
        project: String(line.cwd || ''),
        ts,
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cache_read: num(usage.cache_read_input_tokens),
        cache_write: num(usage.cache_creation_input_tokens),
        cache_write_long: num(written?.ephemeral_1h_input_tokens),
        reasoning: num(details?.thinking_tokens),
        subagent: line.isSidechain === true
      });
    }
    return { events, names: names(text) };
  }
};

/** A name somebody typed beats the one Claude came up with, whichever landed last */
function names(text: string): Record<string, string> {
  const typed: Record<string, string> = {};
  const guessed: Record<string, string> = {};
  for (const line of jsonLines(text, '-title"')) {
    const session = String(line.sessionId || '');
    if (line.type === 'custom-title' && line.customTitle) typed[session] = String(line.customTitle);
    if (line.type === 'ai-title' && line.aiTitle) guessed[session] = String(line.aiTitle);
  }
  return { ...guessed, ...typed };
}
