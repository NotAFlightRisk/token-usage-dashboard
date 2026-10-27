<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Panel from '#lib/components/Panel.svelte';
  import Segmented from '#lib/components/Segmented.svelte';
  import MultiSelect from '#lib/components/MultiSelect.svelte';
  import Figures from '#lib/components/Figures.svelte';
  import Calendar from '#lib/components/Calendar.svelte';
  import Trend from '#lib/components/Trend.svelte';
  import BarList from '#lib/components/BarList.svelte';
  import Donut from '#lib/components/Donut.svelte';
  import Split from '#lib/components/Split.svelte';
  import Clock from '#lib/components/Clock.svelte';
  import Meter from '#lib/components/Meter.svelte';
  import Sessions, { COLUMNS } from '#lib/components/Sessions.svelte';
  import Fields from '#lib/components/Fields.svelte';
  import Problems from '#lib/components/Problems.svelte';
  import SettingsDialog from '#lib/components/Settings.svelte';
  import Logo from '#lib/logos/Logo.svelte';
  import Mark from '#lib/logos/Mark.svelte';
  import { tooltip } from '#lib/tooltip.js';
  import { RANGES, rangeLabel } from '#lib/range.js';
  import {
    compact,
    full,
    modelName,
    money,
    moneyCompact,
    projectName,
    relative
  } from '#lib/format.js';
  import { modelColours, providerFor, providerMeta, toolMeta } from '#lib/providers.js';
  import type { Usage } from '#lib/types.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // the page owns its data after the first paint, so the load result is only a starting point
  const first = untrack(() => data);

  let usage = $state<Usage>(first.usage);
  let saved = $state(first.settings);
  let busy = $state(false);
  let settingsOpen = $state(false);

  let range = $state(first.usage.filters.range);
  let tools = $state<string[]>(first.usage.filters.tools);
  let models = $state<string[]>(first.usage.filters.models);
  let projects = $state<string[]>(first.usage.filters.projects);

  let metric = $state<'tokens' | 'cost'>(first.settings.metric);
  let trendBy = $state<'tool' | 'model'>('tool');
  let modelView = $state<'share' | 'list'>('share');
  let projectBy = $state<'measure' | 'sessions'>('measure');
  let hiddenColumns = $state<string[]>(first.settings.hiddenColumns);

  const query = $derived(
    new URLSearchParams({
      range,
      tools: tools.join(','),
      models: models.join(','),
      projects: projects.join(',')
    }).toString()
  );

  let showing = untrack(() => query);

  async function pull(next: string) {
    busy = true;
    try {
      const response = await fetch(`/api/usage?${next}`);
      if (response.ok) usage = await response.json();
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    if (query === showing) return;
    showing = query;
    void goto(`?${query}`, { shallow: true, replace: true });
    void pull(query);
  });

  $effect(() => {
    const every = setInterval(() => void pull(showing), 30_000);
    return () => clearInterval(every);
  });

  $effect(() => {
    const theme = saved.theme;
    document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
  });

  const post = (path: string, body: Record<string, unknown> = {}) =>
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

  async function save(patch: Record<string, unknown>) {
    const response = await post('/api/settings', patch);
    if (response.ok) saved = await response.json();
  }

  async function rescan() {
    busy = true;
    try {
      const response = await post(`/api/refresh?${showing}`);
      if (response.ok) usage = await response.json();
    } finally {
      busy = false;
    }
  }

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const measure = (slice: { total: number; cost: number | null }) =>
    metric === 'cost' ? (slice.cost ?? 0) : slice.total;

  const show = (slice: { total: number; cost: number | null }) =>
    metric === 'cost' ? money(slice.cost) : compact(slice.total);

  const biggestFirst = (a: { value: number }, b: { value: number }) => b.value - a.value;

  const activeDays = $derived(
    new Set(usage.series.filter((point) => point.total > 0).map((point) => point.day)).size
  );

  const toolKeys = $derived(
    usage.byTool.map((slice) => ({
      id: slice.key,
      label: toolMeta(slice.key).label,
      colour: toolMeta(slice.key).colour
    }))
  );

  const colours = $derived(modelColours(usage.byModel.map((slice) => slice.key)));

  const modelKeys = $derived(
    usage.byModel.map((slice) => ({
      id: slice.key,
      label: modelName(slice.key),
      colour: colours[slice.key]
    }))
  );

  const trendKeys = $derived(trendBy === 'tool' ? toolKeys : modelKeys);

  const modelRows = $derived(
    usage.byModel
      .map((slice) => {
        const provider = providerMeta(providerFor(slice.key));
        return {
          id: slice.key,
          label: modelName(slice.key),
          detail: provider.label,
          value: measure(slice),
          display: show(slice),
          colour: colours[slice.key],
          mark: provider.id,
          hint: `${slice.key} - ${full(slice.total)} tokens over ${full(slice.events)} requests, ${money(slice.cost)} estimated`
        };
      })
      .sort(biggestFirst)
  );

  const projectRows = $derived(
    usage.byProject
      .map((slice) => ({
        id: slice.key,
        label: projectName(slice.key),
        detail: '',
        value: projectBy === 'sessions' ? slice.sessions : measure(slice),
        display: projectBy === 'sessions' ? full(slice.sessions) : show(slice),
        colour: 'var(--accent)',
        hint: `${slice.key || 'unknown'} - ${full(slice.total)} tokens, ${full(slice.sessions)} sessions`
      }))
      .sort(biggestFirst)
  );

  /** Tools with nothing to show still get a row, so it is obvious what else is supported. */
  const toolRows = $derived(
    usage.sources.map((source) => {
      const slice = usage.byTool.find((entry) => entry.key === source.id);
      const tool = toolMeta(source.id);
      return {
        id: source.id,
        label: tool.label,
        detail: slice ? `${full(slice.sessions)} sessions` : 'not found',
        value: slice ? measure(slice) : 0,
        display: slice ? show(slice) : '--',
        colour: tool.colour,
        mark: source.id,
        hint: source.present
          ? `${full(source.files)} files under ${source.root}`
          : `Nothing at ${source.root}`
      };
    })
  );

  const mix = $derived([
    {
      id: 'input',
      label: 'Input',
      value: usage.totals.tokens.input,
      display: compact(usage.totals.tokens.input),
      colour: 'var(--ramp-4)',
      hint: 'Fresh prompt tokens, billed at full rate'
    },
    {
      id: 'output',
      label: 'Output',
      value: usage.totals.tokens.output,
      display: compact(usage.totals.tokens.output),
      colour: 'var(--ramp-2)',
      hint: `Everything the model wrote back, ${compact(usage.totals.reasoning)} of it reasoning`
    },
    {
      id: 'cache_read',
      label: 'Cache read',
      value: usage.totals.tokens.cache_read,
      display: compact(usage.totals.tokens.cache_read),
      colour: 'var(--ramp-1)',
      hint: 'Context served from cache, usually a tenth of the input price'
    },
    {
      id: 'cache_write',
      label: 'Cache write',
      value: usage.totals.tokens.cache_write,
      display: compact(usage.totals.tokens.cache_write),
      colour: 'var(--ramp-3)',
      hint: 'Putting context into the cache, a premium on the input price'
    }
  ]);

  const cacheShare = $derived(
    usage.totals.total ? (usage.totals.tokens.cache_read / usage.totals.total) * 100 : 0
  );
</script>

<svelte:head>
  <title>Token usage dashboard</title>
</svelte:head>

<header class="bar">
  <a class="brand" href="/">
    <Logo />
    <span>Token usage</span>
  </a>

  <div class="filters">
    <Segmented
      options={RANGES.map((entry) => ({ id: entry.id, label: entry.label }))}
      bind:value={range}
      label="Date range"
      size="sm"
    />
    <Segmented
      options={[
        { id: 'tokens', label: 'Tokens' },
        {
          id: 'cost',
          label: 'Est. cost',
          hint: 'At published API rates. Your subscription is billed separately.'
        }
      ]}
      bind:value={metric}
      label="Measure"
      size="sm"
    />
    <MultiSelect
      label="Tools"
      options={usage.options.tools}
      bind:selected={tools}
      format={(id) => toolMeta(id).label}
    />
    <MultiSelect
      label="Models"
      options={usage.options.models}
      bind:selected={models}
      format={modelName}
    />
    <MultiSelect
      label="Projects"
      options={usage.options.projects}
      bind:selected={projects}
      format={projectName}
    />
    {#if tools.length || models.length || projects.length}
      <button
        type="button"
        class="reset"
        onclick={() => {
          tools = [];
          models = [];
          projects = [];
        }}>Clear filters</button
      >
    {/if}
  </div>

  <div class="tools">
    <button
      type="button"
      class="icon"
      class:busy
      aria-label="Rescan now"
      use:tooltip={`Last scan ${relative(usage.scannedAt)}`}
      onclick={rescan}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M13.4 7A5.5 5.5 0 1 0 12.6 11"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          d="M13.8 3.4v3.8h-3.8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      type="button"
      class="icon"
      aria-label="Settings"
      use:tooltip={'Settings'}
      onclick={() => (settingsOpen = true)}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path
          d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
</header>

<main>
  <Figures
    totals={usage.totals}
    previous={usage.previous}
    {activeDays}
    rangeLabel={rangeLabel(usage.filters.range)}
    unpriced={usage.unpriced}
  />

  <div class="grid">
    <Panel
      title="Every day so far"
      span={8}
      hint="One square per day, whatever range is picked above. Outlined days are before your records start."
    >
      <Calendar days={usage.calendar} {metric} oldest={usage.oldest} />
    </Panel>

    <Panel
      title="Plan windows"
      span={4}
      hint="Straight from each account, not worked out from tokens"
    >
      {#if usage.windows.length}
        <div class="meters">
          {#each usage.windows as window (window.id)}
            <Meter {window} />
          {/each}
        </div>
      {:else}
        <p class="empty">
          No plan windows yet. Sign in with Claude Code or run Codex once and they turn up here.
        </p>
      {/if}
    </Panel>

    <Panel title="Day by day" span={12} hint="Stacked over the range you picked">
      {#snippet actions()}
        <Segmented
          options={[
            { id: 'tool', label: 'By tool' },
            { id: 'model', label: 'By model' }
          ]}
          bind:value={trendBy}
          label="Trend grouping"
          size="sm"
        />
      {/snippet}
      <Trend
        series={trendBy === 'tool' ? usage.series : usage.seriesByModel}
        keys={trendKeys}
        {metric}
      />
    </Panel>

    <Panel title="Models" span={5} hint="Click one to filter the whole page by it">
      {#snippet actions()}
        <Segmented
          options={[
            { id: 'share', label: 'Share' },
            { id: 'list', label: 'Ranked' }
          ]}
          bind:value={modelView}
          label="Model view"
          size="sm"
        />
      {/snippet}
      {#if modelView === 'share'}
        <div class="share">
          <Donut
            slices={modelRows.map((row) => ({
              id: row.id,
              label: row.label,
              value: row.value,
              colour: row.colour,
              display: row.display
            }))}
            centre={show(usage.totals)}
            caption={metric === 'cost' ? 'estimated' : 'tokens'}
          />
          <ul class="key">
            {#each modelRows as row (row.id)}
              <li>
                <Mark id={row.mark} label={row.detail} colour={row.colour} size={14} />
                <span>{row.label}</span>
                <b class="num">{row.display}</b>
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <BarList rows={modelRows} active={models} onpick={(id) => (models = toggle(models, id))} />
      {/if}
    </Panel>

    <Panel title="Projects" span={7} hint="Where the work happened. Click one to filter.">
      {#snippet actions()}
        <Segmented
          options={[
            { id: 'measure', label: metric === 'cost' ? 'Est. cost' : 'Tokens' },
            { id: 'sessions', label: 'Sessions' }
          ]}
          bind:value={projectBy}
          label="Project measure"
          size="sm"
        />
      {/snippet}
      <BarList
        rows={projectRows.slice(0, 8)}
        active={projects}
        onpick={(id) => (projects = toggle(projects, id))}
      />
    </Panel>

    <Panel
      title="Where the tokens go"
      span={4}
      hint="Cache reads are cheap, cache writes are not. This is the split that decides the bill."
    >
      <Split parts={mix} />
      <p class="aside">
        {cacheShare.toFixed(0)}% of everything counted was served from cache.
      </p>
    </Panel>

    <Panel title="When you work" span={5} hint="Local time, over the range above">
      <Clock points={usage.clock} />
    </Panel>

    <Panel title="Tools" span={3} hint="Click one to filter the whole page by it">
      <BarList rows={toolRows} active={tools} onpick={(id) => (tools = toggle(tools, id))} />
    </Panel>

    <Panel title="Recent sessions" span={12} hint="Click a column heading to sort by it">
      {#snippet actions()}
        <Fields
          options={COLUMNS}
          bind:hidden={hiddenColumns}
          onchange={(hidden) => save({ hiddenColumns: hidden })}
        />
      {/snippet}
      <Sessions
        rows={usage.sessions}
        hidden={hiddenColumns}
        onpick={(project) => (projects = toggle(projects, project))}
      />
    </Panel>
  </div>

  <footer>
    <span>Reads the transcripts already on this machine. Nothing is sent anywhere.</span>
    <span>
      {#if usage.oldest}Records from {new Date(usage.oldest).toLocaleDateString('en-GB')} ·{/if}
      Scanned {relative(usage.scannedAt)}
    </span>
  </footer>
</main>

<Problems problems={usage.problems} />

<SettingsDialog
  bind:open={settingsOpen}
  {saved}
  sources={usage.sources}
  dbPath={data.paths.db}
  scannedAt={usage.scannedAt}
  onsave={save}
  onrescan={rescan}
/>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    padding: 12px clamp(16px, 3vw, 32px);
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .reset {
    padding: 6px 11px;
    font-size: 0.8125rem;
    color: var(--text-muted);
    background: none;
    border: 0;
    border-radius: 999px;

    &:hover {
      color: var(--text);
      background: var(--surface-2);
    }
  }

  .tools {
    display: flex;
    gap: 6px;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    color: var(--text-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition:
      color var(--quick),
      border-color var(--quick);

    &:hover {
      color: var(--text);
      border-color: var(--border-strong);
    }

    &.busy svg {
      animation: spin 900ms linear infinite;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  main {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    max-width: 1560px;
    margin: 0 auto;
    padding: var(--gap) clamp(16px, 3vw, 32px) 64px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--gap);
  }

  .meters {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .share {
    display: grid;
    grid-template-columns: minmax(0, 190px) 1fr;
    align-content: center;
    align-items: center;
    gap: 20px;
    height: 100%;
  }

  .key {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: grid;
      grid-template-columns: 14px 1fr auto;
      align-items: center;
      gap: 9px;
      font-size: 0.8125rem;
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-muted);
    }

    b {
      font-weight: 550;
    }
  }

  .aside {
    margin: 14px 0 0;
    font-size: 0.8125rem;
    color: var(--text-faint);
  }

  .empty {
    margin: 0;
    padding: 16px 0;
    font-size: 0.875rem;
    color: var(--text-faint);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 20px;
    font-size: 0.75rem;
    color: var(--text-faint);
  }

  @media (max-width: 700px) {
    .bar {
      position: static;
    }
  }

  @media (max-width: 900px) {
    .share {
      grid-template-columns: 1fr;
      justify-items: center;
    }
  }
</style>
