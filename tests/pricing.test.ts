import { describe, expect, it } from 'vitest';
import { costOf, rateFor } from '../src/lib/pricing';
import { providerFor } from '../src/lib/providers';

const tokens = { input: 1_000_000, output: 0, cache_read: 0, cache_write: 0, cache_write_long: 0 };

describe('pricing', () => {
  it('prices a dated snapshot like the family it belongs to', () => {
    expect(rateFor('claude-haiku-4-5-20251001')).toEqual(rateFor('claude-haiku-4-5'));
  });

  it('picks the longest family, not the first that matches', () => {
    expect(rateFor('gpt-5.6-sol-pro:latest')?.input).toBe(rateFor('gpt-5.6-sol-pro')?.input);
    expect(rateFor('claude-opus-4-1')?.input).toBe(15);
  });

  it('will not treat a near-miss as a match', () => {
    expect(rateFor('claude-opus-5000')).toBeNull();
  });

  it('returns null for an unknown model rather than calling it free', () => {
    expect(costOf('some-new-model', tokens)).toBeNull();
  });

  it('lets a local override win', () => {
    const rate = { input: 99, output: 0, cacheRead: 0, cacheWrite: 0 };
    expect(costOf('claude-opus-5', tokens, { 'claude-opus-5': rate })).toBe(99);
  });

  it('charges cache reads at a tenth and cache writes at a premium', () => {
    const read = costOf('claude-opus-5', { ...tokens, input: 0, cache_read: 1_000_000 })!;
    const write = costOf('claude-opus-5', { ...tokens, input: 0, cache_write: 1_000_000 })!;
    const plain = costOf('claude-opus-5', tokens)!;

    expect(read).toBeCloseTo(plain * 0.1);
    expect(write).toBeCloseTo(plain * 1.25);
  });

  it('charges an hour in the cache at twice the input price', () => {
    const write = { ...tokens, input: 0, cache_write: 1_000_000, cache_write_long: 600_000 };
    expect(costOf('claude-opus-5', write)).toBeCloseTo(0.4 * 5 * 1.25 + 0.6 * 5 * 2);
  });
});

describe('provider matching', () => {
  it('reads the vendor prefix an aggregator adds', () => {
    expect(providerFor('anthropic/claude-sonnet-5')).toBe('anthropic');
    expect(providerFor('openai/gpt-5.6-luna')).toBe('openai');
  });

  it('falls back to other rather than guessing', () => {
    expect(providerFor('some-local-thing')).toBe('unknown');
  });
});
