<script lang="ts">
  import { RANGES } from '#lib/range.js';
  import { relative } from '#lib/format.js';
  import { RATES, type Rate } from '#lib/pricing.js';
  import { THEMES, type Theme } from '#lib/themes.js';
  import type { Usage } from '#lib/types.js';

  type Saved = {
    theme: Theme;
    range: string;
    metric: 'tokens' | 'cost';
    scanIntervalSec: number;
    claudeWindows: boolean;
    prices: Record<string, Rate>;
  };

  let {
    open = $bindable(),
    saved,
    sources,
    dbPath,
    scannedAt,
    onsave,
    onrescan
  }: {
    open: boolean;
    saved: Saved;
    sources: Usage['sources'];
    dbPath: string;
    scannedAt: number;
    onsave: (patch: Partial<Saved>) => void;
    onrescan: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let priceModel = $state('');
  let priceIn = $state('');
  let priceOut = $state('');

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  const overrides = $derived(Object.entries(saved.prices));

  function addPrice() {
    const input = Number(priceIn);
    const output = Number(priceOut);
    if (!priceModel.trim() || !Number.isFinite(input) || !Number.isFinite(output)) return;
    onsave({
      prices: {
        ...saved.prices,
        [priceModel.trim()]: { input, output, cacheRead: input * 0.1, cacheWrite: input * 1.25 }
      }
    });
    priceModel = '';
    priceIn = '';
    priceOut = '';
  }

  function dropPrice(model: string) {
    const next = { ...saved.prices };
    delete next[model];
    onsave({ prices: next });
  }

  const ENV: Record<string, string> = {
    'claude-code': 'AIUSAGE_CLAUDE_DIR',
    codex: 'AIUSAGE_CODEX_DIR',
    opencode: 'AIUSAGE_OPENCODE_DIR'
  };
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="settings-title"
  onclose={() => (open = false)}
  onpointerdown={(event) => {
    if (event.target === dialog) open = false;
  }}
>
  <header>
    <h2 id="settings-title">Settings</h2>
    <button type="button" class="close" aria-label="Close settings" onclick={() => (open = false)}>
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </header>

  <div class="body">
    <section>
      <h3>Appearance</h3>
      <label class="field">
        <span>Theme</span>
        <select
          value={saved.theme}
          onchange={(event) => onsave({ theme: event.currentTarget.value as Saved['theme'] })}
        >
          {#each THEMES as theme (theme.id)}
            <option value={theme.id}>{theme.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Range on open</span>
        <select
          value={saved.range}
          onchange={(event) => onsave({ range: event.currentTarget.value })}
        >
          {#each RANGES as range (range.id)}
            <option value={range.id}>{range.label}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Headline measure</span>
        <select
          value={saved.metric}
          onchange={(event) => onsave({ metric: event.currentTarget.value as Saved['metric'] })}
        >
          <option value="tokens">Tokens</option>
          <option value="cost">Estimated cost</option>
        </select>
      </label>
    </section>

    <section>
      <h3>Data</h3>
      <ul class="sources">
        {#each sources as source (source.id)}
          <li>
            <div>
              <b>{source.label}</b>
              <code>{source.root}</code>
            </div>
            <span class="badge" class:on={source.present}>
              {source.present ? `${source.files} files` : 'not found'}
            </span>
          </li>
        {/each}
      </ul>
      <p class="note">
        Point these somewhere else with
        {#each sources as source, index (source.id)}<code>
            {ENV[source.id] ?? source.id}
          </code>{index < sources.length - 1 ? ', ' : ''}{/each}. History lives in
        <code>{dbPath}</code>
        and outlives the transcripts, which most tools prune.
      </p>
      <label class="field">
        <span>Rescan every</span>
        <select
          value={String(saved.scanIntervalSec)}
          onchange={(event) => onsave({ scanIntervalSec: Number(event.currentTarget.value) })}
        >
          <option value="30">30 seconds</option>
          <option value="120">2 minutes</option>
          <option value="600">10 minutes</option>
          <option value="3600">an hour</option>
        </select>
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={saved.claudeWindows}
          onchange={(event) => onsave({ claudeWindows: event.currentTarget.checked })}
        />
        <span>
          Ask Anthropic for your 5-hour and 7-day windows
          <em>Reads the Claude Code credentials on this machine. Nothing else leaves it.</em>
        </span>
      </label>
      <div class="row">
        <button type="button" class="action" onclick={onrescan}>Rescan now</button>
        <span class="note">Last scan {relative(scannedAt)}</span>
      </div>
    </section>

    <section>
      <h3>Prices</h3>
      <p class="note">
        Dollars per million tokens. {Object.keys(RATES).length} models are priced out of the box; anything
        you add here wins, and an unknown model is reported rather than counted as free.
      </p>
      {#if overrides.length}
        <ul class="prices">
          {#each overrides as [model, rate] (model)}
            <li>
              <code>{model}</code>
              <span class="num">in {rate.input} / out {rate.output}</span>
              <button type="button" onclick={() => dropPrice(model)}>Remove</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="add">
        <input placeholder="model id" bind:value={priceModel} />
        <input placeholder="in" inputmode="decimal" bind:value={priceIn} />
        <input placeholder="out" inputmode="decimal" bind:value={priceOut} />
        <button type="button" class="action" onclick={addPrice}>Add</button>
      </div>
    </section>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: min(760px, calc(100vh - 48px));
    padding: 0;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);

    &[open] {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }

    &::backdrop {
      background: rgb(10 10 16 / 0.5);
      backdrop-filter: blur(2px);
    }
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px var(--pad);
    border-bottom: 1px solid var(--border);

    h2 {
      font-size: 1rem;
    }
  }

  .close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--text-muted);
    background: none;
    border: 0;
    border-radius: var(--radius-sm);

    &:hover {
      color: var(--text);
      background: var(--surface-2);
    }
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 26px;
    padding: var(--pad);
    overflow-y: auto;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h3 {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    font-size: 0.875rem;
  }

  select,
  input:not([type='checkbox']) {
    padding: 6px 9px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
  }

  .check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 0.875rem;

    input {
      margin-top: 3px;
      accent-color: var(--accent);
    }

    em {
      display: block;
      font-style: normal;
      font-size: 0.75rem;
      color: var(--text-faint);
    }
  }

  .sources {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 12px;
      background: var(--surface-2);
      border-radius: var(--radius-sm);
    }

    b {
      display: block;
      font-size: 0.875rem;
      font-weight: 550;
    }
  }

  code {
    font-family: var(--mono);
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .badge {
    flex: none;
    padding: 2px 8px;
    font-size: 0.6875rem;
    color: var(--text-faint);
    background: var(--surface-3);
    border-radius: 999px;

    &.on {
      color: var(--good);
    }
  }

  .note {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.55;
    color: var(--text-muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .action {
    padding: 6px 13px;
    font-size: 0.8125rem;
    font-weight: 550;
    color: var(--accent-text);
    background: var(--accent);
    border: 0;
    border-radius: var(--radius-sm);

    &:hover {
      filter: brightness(1.08);
    }
  }

  .prices {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.8125rem;

      code {
        flex: 1;
      }

      button {
        padding: 2px 8px;
        font-size: 0.75rem;
        color: var(--text-muted);
        background: var(--surface-2);
        border: 0;
        border-radius: 6px;

        &:hover {
          color: var(--bad);
        }
      }
    }
  }

  .add {
    display: grid;
    grid-template-columns: 1fr 72px 72px auto;
    gap: 6px;
  }
</style>
