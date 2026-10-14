export type Provider = {
  id: string;
  label: string;
  colour: string;
};

export const PROVIDERS: Provider[] = [
  { id: 'anthropic', label: 'Anthropic', colour: '#d97757' },
  { id: 'openai', label: 'OpenAI', colour: '#10a37f' },
  { id: 'google', label: 'Google', colour: '#4285f4' },
  { id: 'meta', label: 'Meta', colour: '#0668e1' },
  { id: 'mistral', label: 'Mistral', colour: '#fa520f' },
  { id: 'xai', label: 'xAI', colour: '#7c7c8a' },
  { id: 'deepseek', label: 'DeepSeek', colour: '#4d6bfe' },
  { id: 'qwen', label: 'Qwen', colour: '#a855f7' },
  { id: 'unknown', label: 'Other', colour: '#8b93a7' }
];

const MATCHES: [RegExp, string][] = [
  [/^claude/, 'anthropic'],
  [/^(gpt|codex|o[1-4]-|chatgpt|text-embedding)/, 'openai'],
  [/^(gemini|gemma|palm)/, 'google'],
  [/^(llama|code-?llama)/, 'meta'],
  [/^(mistral|mixtral|codestral|magistral|devstral)/, 'mistral'],
  [/^grok/, 'xai'],
  [/^deepseek/, 'deepseek'],
  [/^(qwen|qwq)/, 'qwen']
];

/** Vendor-prefixed ids like `anthropic/claude-sonnet-5` come back from OpenRouter. */
export function providerFor(model: string): string {
  const name = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model;
  const vendor = model.includes('/') ? model.slice(0, model.indexOf('/')).toLowerCase() : '';
  if (PROVIDERS.some((provider) => provider.id === vendor)) return vendor;
  return MATCHES.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1] ?? 'unknown';
}

export const providerMeta = (id: string) =>
  PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[PROVIDERS.length - 1];

const shade = (colour: string, index: number) => {
  if (!index) return colour;
  const mix = index % 2 ? 'black' : 'white';
  return `color-mix(in oklch, ${colour}, ${mix} ${Math.min(Math.ceil(index / 2) * 18, 72)}%)`;
};

/** Each model after a provider's first goes alternately darker and lighter, so siblings differ */
export function modelColours(models: string[]): Record<string, string> {
  const seen = new Map<string, number>();
  return Object.fromEntries(
    models.map((model) => {
      const provider = providerFor(model);
      const index = seen.get(provider) ?? 0;
      seen.set(provider, index + 1);
      return [model, shade(providerMeta(provider).colour, index)];
    })
  );
}

export type Tool = {
  id: string;
  label: string;
  colour: string;
  home: string;
};

export const TOOLS: Tool[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    colour: '#d97757',
    home: 'https://claude.com/claude-code'
  },
  { id: 'codex', label: 'Codex', colour: '#10a37f', home: 'https://developers.openai.com/codex' },
  { id: 'opencode', label: 'OpenCode', colour: '#f5a524', home: 'https://opencode.ai' },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    colour: '#4285f4',
    home: 'https://github.com/google-gemini/gemini-cli'
  }
];

export const toolMeta = (id: string) =>
  TOOLS.find((tool) => tool.id === id) ?? { id, label: id, colour: '#8b93a7', home: '' };
