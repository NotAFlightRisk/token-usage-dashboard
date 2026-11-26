<script lang="ts" module>
  import { clockLabel, compact, duration, modelName, money, percent } from '#lib/format.js';
  import type { SessionRow } from '#lib/types.js';

  type Column = {
    id: string;
    label: string;
    hint: string;
    by: (row: SessionRow) => string | number | null;
    show?: (row: SessionRow) => string;
    numeric?: boolean;
  };

  const share = (value: number | null) => (value === null ? '--' : percent(value * 100));

  export const COLUMNS: Column[] = [
    { id: 'session', label: 'Session', hint: 'The tool and its session id', by: (row) => row.id },
    {
      id: 'name',
      label: 'Session name',
      hint: 'What the session was called, if it got a name',
      by: (row) => row.name,
      show: (row) => row.name ?? ''
    },
    { id: 'project', label: 'Project', hint: 'Where it ran', by: (row) => row.project },
    {
      id: 'models',
      label: 'Models',
      hint: 'Every model the session used',
      by: (row) => row.models,
      show: (row) => row.models.split(', ').map(modelName).join(', ')
    },
    {
      id: 'ran',
      label: 'Ran',
      hint: 'When it last did anything',
      by: (row) => row.ended,
      show: (row) => clockLabel(row.ended)
    },
    {
      id: 'tokens',
      label: 'Tokens',
      hint: 'Everything in and out, cache included',
      by: (row) => row.total,
      show: (row) => compact(row.total),
      numeric: true
    },
    {
      id: 'cost',
      label: 'Est. cost',
      hint: 'Worked out from list prices, not your bill',
      by: (row) => row.cost,
      show: (row) => money(row.cost),
      numeric: true
    },
    {
      id: 'peak',
      label: 'Peak context',
      hint: 'The biggest prompt the model was handed in one go',
      by: (row) => row.peak,
      show: (row) => compact(row.peak),
      numeric: true
    },
    {
      id: 'cache',
      label: 'Cache hits',
      hint: 'How much of the input came straight from cache',
      by: (row) => row.cacheHit,
      show: (row) => share(row.cacheHit),
      numeric: true
    },
    {
      id: 'subagents',
      label: 'Subagents',
      hint: 'Share of the tokens spent by subagents. Claude Code only.',
      by: (row) => row.subagents,
      show: (row) => share(row.subagents),
      numeric: true
    },
    {
      id: 'turns',
      label: 'Turns',
      hint: 'Replies from the model, subagents included',
      by: (row) => row.turns,
      show: (row) => String(row.turns),
      numeric: true
    }
  ];
</script>

<script lang="ts">
  import { tooltip } from '#lib/tooltip.js';
  import Mark from '#lib/logos/Mark.svelte';
  import { projectName } from '#lib/format.js';
  import { toolMeta } from '#lib/providers.js';

  let {
    rows,
    hidden,
    onpick
  }: { rows: SessionRow[]; hidden: string[]; onpick?: (project: string) => void } = $props();

  let sortBy = $state('ran');
  let descending = $state(true);

  const columns = $derived(
    COLUMNS.filter(
      (column) =>
        !hidden.includes(column.id) && (column.id !== 'name' || rows.some((row) => row.name))
    )
  );

  const sorted = $derived.by(() => {
    const by = (COLUMNS.find((column) => column.id === sortBy) ?? COLUMNS[0]).by;
    return rows.toSorted((a, b) => {
      const [left, right] = [by(a), by(b)];
      if (left === right) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const order = left < right ? -1 : 1;
      return descending ? -order : order;
    });
  });

  function sort(column: Column) {
    descending =
      sortBy === column.id ? !descending : Boolean(column.numeric || column.id === 'ran');
    sortBy = column.id;
  }
</script>

{#if rows.length}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          {#each columns as column (column.id)}
            <th
              scope="col"
              class:right={column.numeric}
              aria-sort={sortBy === column.id ? (descending ? 'descending' : 'ascending') : 'none'}
            >
              <button type="button" use:tooltip={column.hint} onclick={() => sort(column)}>
                {column.label}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sorted as row (`${row.tool}:${row.id}`)}
          {@const tool = toolMeta(row.tool)}
          <tr>
            {#each columns as column (column.id)}
              {#if column.id === 'session'}
                <td>
                  <span class="tool">
                    <Mark id={row.tool} label={tool.label} colour={tool.colour} size={14} />
                    <span class="id mono" use:tooltip={row.id}>{row.id.slice(0, 8)}</span>
                  </span>
                </td>
              {:else if column.id === 'project'}
                <td>
                  <button
                    type="button"
                    class="link"
                    use:tooltip={row.project || 'unknown'}
                    onclick={() => onpick?.(row.project)}
                  >
                    {projectName(row.project)}
                  </button>
                </td>
              {:else if column.id === 'ran'}
                <td
                  use:tooltip={`${clockLabel(row.started)} for ${duration(row.ended - row.started)}`}
                >
                  {column.show?.(row)}
                </td>
              {:else}
                <td
                  class:right={column.numeric}
                  class:num={column.numeric}
                  class:muted={!column.numeric}
                >
                  {column.show?.(row)}
                </td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p class="empty">No sessions in this range</p>
{/if}

<style>
  .scroll {
    overflow-x: auto;
    max-height: 420px;
    overflow-y: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0 10px 8px;
    background: var(--surface);
    text-align: left;
    white-space: nowrap;

    button {
      padding: 0;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-faint);
      background: none;
      border: 0;

      &:hover {
        color: var(--text);
      }
    }

    &[aria-sort='ascending'] button::after {
      content: ' ↑';
    }

    &[aria-sort='descending'] button::after {
      content: ' ↓';
    }

    &[aria-sort='ascending'] button,
    &[aria-sort='descending'] button {
      color: var(--text-muted);
    }
  }

  td {
    padding: 7px 10px;
    border-top: 1px solid var(--border);
    white-space: nowrap;
  }

  tbody tr:hover td {
    background: var(--surface-2);
  }

  .right {
    text-align: right;
  }

  .muted {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
  }

  .tool {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .mono {
    font-family: var(--mono);
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .link {
    padding: 0;
    background: none;
    border: 0;
    color: var(--text);
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 3px;

    &:hover {
      color: var(--accent);
      text-decoration-color: currentColor;
    }
  }

  .empty {
    margin: 0;
    padding: 24px 0;
    text-align: center;
    color: var(--text-faint);
  }
</style>
