import { describe, expect, it } from 'vitest';
import { claudeCode } from '../src/lib/server/sources/claude';
import { codex } from '../src/lib/server/sources/codex';

const claudeLine = (id: string, usage: Record<string, unknown>, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-09-08T10:00:00.000Z',
    sessionId: 'session-a',
    cwd: '/work/thing',
    message: { id, model: 'claude-opus-5', usage },
    ...extra
  });

describe('the Claude Code reader', () => {
  it('keeps the largest value seen for a message that was rewritten as it streamed', () => {
    const text = [
      claudeLine('msg_1', { input_tokens: 4, output_tokens: 10, cache_read_input_tokens: 100 }),
      claudeLine('msg_1', { input_tokens: 4, output_tokens: 260, cache_read_input_tokens: 100 })
    ].join('\n');

    const { events } = claudeCode.parse('/x.jsonl', text);

    expect(events).toHaveLength(2);
    expect(events[0].id).toBe(events[1].id);
    expect(Math.max(...events.map((event) => event.output))).toBe(260);
  });

  it('takes the session from the line, so a subagent transcript is not its own session', () => {
    const text = claudeLine('msg_2', { output_tokens: 5 }, { sessionId: 'parent-session' });
    const { events } = claudeCode.parse('/parent/subagents/agent-ff.jsonl', text);

    expect(events[0].session).toBe('parent-session');
    expect(events[0].project).toBe('/work/thing');
  });

  it('prefers a name somebody typed over the one Claude guessed, whatever the order', () => {
    const title = (type: string, field: string, value: string) =>
      JSON.stringify({ type, [field]: value, sessionId: 'session-a' });
    const text = [
      title('custom-title', 'customTitle', 'maintain'),
      title('ai-title', 'aiTitle', 'Fixing the thing')
    ].join('\n');

    expect(claudeCode.parse('/x.jsonl', text).names).toEqual({ 'session-a': 'maintain' });
  });

  it('flags subagent lines so their share can be told apart', () => {
    const text = [
      claudeLine('msg_4', { output_tokens: 5 }),
      claudeLine('msg_5', { output_tokens: 5 }, { isSidechain: true })
    ].join('\n');

    expect(claudeCode.parse('/x.jsonl', text).events.map((event) => event.subagent)).toEqual([
      false,
      true
    ]);
  });

  it('keeps the hour-long part of a cache write apart, since it bills higher', () => {
    const text = claudeLine('msg_6', {
      cache_creation_input_tokens: 300,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 }
    });

    expect(claudeCode.parse('/x.jsonl', text).events[0]).toMatchObject({
      cache_write: 300,
      cache_write_long: 200
    });
  });

  it('skips synthetic models and anything without usage', () => {
    const text = [
      JSON.stringify({ type: 'user', message: { content: 'hello' } }),
      claudeLine('msg_3', { output_tokens: 9 }).replace('claude-opus-5', '<synthetic>')
    ].join('\n');

    expect(claudeCode.parse('/x.jsonl', text).events).toEqual([]);
  });
});

const rollout = (turns: [number, number][], repeatLast = false) => {
  const lines = [
    JSON.stringify({
      type: 'session_meta',
      timestamp: '2026-09-08T09:00:00.000Z',
      payload: { session_id: 'roll-1', cwd: '/work/api' }
    }),
    JSON.stringify({
      type: 'turn_context',
      timestamp: '2026-09-08T09:00:01.000Z',
      payload: { model: 'gpt-5.6-sol' }
    })
  ];

  let running = { input: 0, output: 0 };
  for (const [input, output] of turns) {
    running = { input: running.input + input, output: running.output + output };
    lines.push(
      JSON.stringify({
        type: 'event_msg',
        timestamp: '2026-09-08T09:01:00.000Z',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: input,
              cached_input_tokens: 0,
              output_tokens: output
            },
            total_token_usage: {
              input_tokens: running.input,
              output_tokens: running.output,
              total_tokens: running.input + running.output
            }
          },
          rate_limits: {
            primary: { used_percent: 12, window_minutes: 300, resets_at: 1788922768 },
            plan_type: 'plus'
          }
        }
      })
    );
    if (repeatLast && input === turns[turns.length - 1][0]) lines.push(lines[lines.length - 1]);
  }
  return lines.join('\n');
};

describe('the Codex reader', () => {
  it('counts the repeated token_count at the end of a rollout only once', () => {
    const once = codex.parse(
      '/r.jsonl',
      rollout([
        [10, 2],
        [20, 3]
      ])
    );
    const twice = codex.parse(
      '/r.jsonl',
      rollout(
        [
          [10, 2],
          [20, 3]
        ],
        true
      )
    );

    const ids = new Set(twice.events.map((event) => event.id));
    expect(ids.size).toBe(once.events.length);
  });

  it('splits cached input out of the input count so it is not billed twice', () => {
    const text = rollout([[10, 2]]).replace('"cached_input_tokens":0', '"cached_input_tokens":6');
    const [event] = codex.parse('/r.jsonl', text).events;

    expect(event.input).toBe(4);
    expect(event.cache_read).toBe(6);
    expect(event.model).toBe('gpt-5.6-sol');
    expect(event.project).toBe('/work/api');
  });

  it('reads the plan windows that ride along with every count', () => {
    const { windows } = codex.parse('/r.jsonl', rollout([[10, 2]]));

    expect(windows?.[0]).toMatchObject({
      label: 'Codex 5-hour',
      used_percent: 12,
      detail: 'plus plan'
    });
  });
});

describe('event identity across files', () => {
  it('will not merge two rollouts that both restart their running total', () => {
    const text = rollout([[10, 2]]);
    const first = codex.parse('/s/rollout-2026-09-08T09-00-00-abc.jsonl', text);
    const second = codex.parse('/s/rollout-2026-09-08T11-00-00-def.jsonl', text);

    expect(first.events[0].id).not.toBe(second.events[0].id);
  });

  it('falls back to the rollout name when a file has lost its session header', () => {
    const text = rollout([[10, 2]])
      .split('\n')
      .filter((line) => !line.includes('session_meta'))
      .join('\n');
    const { events } = codex.parse('/s/rollout-2026-09-08T09-00-00-abc.jsonl', text);

    expect(events[0].session).toBe('rollout-2026-09-08T09-00-00-abc');
  });
});
