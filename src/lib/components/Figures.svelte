<script lang="ts">
  import { tooltip } from '#lib/tooltip.js';
  import { compact, delta, full, money } from '#lib/format.js';
  import type { Slice } from '#lib/types.js';

  let {
    totals,
    previous,
    activeDays,
    rangeLabel,
    unpriced
  }: {
    totals: Slice;
    previous: Slice;
    activeDays: number;
    rangeLabel: string;
    unpriced: string[];
  } = $props();

  const change = $derived(delta(totals.total, previous.total));
  const costChange = $derived(unpriced.length ? null : delta(totals.cost ?? 0, previous.cost ?? 0));

  const perDay = $derived(activeDays ? totals.total / activeDays : 0);

  const COST_HINT =
    'What these tokens would cost at published API rates. A subscription is billed separately.';
</script>

<div class="figures">
  <div class="lead">
    <span class="cap">Tokens, {rangeLabel.toLowerCase()}</span>
    <strong class="num" use:tooltip={full(totals.total)}>{compact(totals.total)}</strong>
    {#if change}
      <span class="delta" use:tooltip={`on the ${rangeLabel.toLowerCase()} before`}>
        {change.text}
      </span>
    {/if}
  </div>

  <dl>
    <div>
      <dt use:tooltip={COST_HINT}>Est. cost</dt>
      <dd class="num">
        {money(totals.cost)}
        {#if costChange}<i class="delta cost {costChange.tone}">{costChange.text}</i>{/if}
        {#if unpriced.length}
          <i
            class="delta"
            use:tooltip={`Leaves out ${unpriced.join(', ')} - no price yet. Add one in Settings.`}
          >
            {unpriced.length} unpriced<span class="visually-hidden">: {unpriced.join(', ')}</span>
          </i>
        {/if}
      </dd>
    </div>
    <div>
      <dt>Sessions</dt>
      <dd class="num">{full(totals.sessions)}</dd>
    </div>
    <div>
      <dt use:tooltip={'Days with at least one request'}>Active days</dt>
      <dd class="num">{full(activeDays)}</dd>
    </div>
    <div>
      <dt use:tooltip={'Tokens per active day'}>Daily pace</dt>
      <dd class="num">{compact(perDay)}</dd>
    </div>
  </dl>
</div>

<style>
  .figures {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 24px 40px;
    padding: 22px var(--pad);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }

  .lead {
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong {
      font-size: clamp(2.6rem, 6vw, 3.4rem);
      font-weight: 600;
      line-height: 1;
      letter-spacing: -0.035em;
    }
  }

  .cap {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .lead .delta {
    margin-top: 4px;
  }

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 36px;
    margin: 0;

    div {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-left: 22px;
      border-left: 1px solid var(--border);
    }
  }

  dt {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  dd {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0;
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .delta {
    font-size: 0.8125rem;
    font-weight: 550;
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);

    &.cost.up {
      color: var(--bad);
    }

    &.cost.down {
      color: var(--good);
    }
  }

  dd .delta {
    font-size: 0.75rem;
  }

  @media (max-width: 640px) {
    dl div {
      padding-left: 0;
      border-left: 0;
    }
  }
</style>
