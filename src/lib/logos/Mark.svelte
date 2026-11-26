<script lang="ts">
  import { MARKS } from './marks';

  let {
    id,
    label,
    colour,
    size = 16
  }: { id: string; label: string; colour?: string; size?: number } = $props();

  const path = $derived(MARKS[id]);
  const initials = $derived(
    label
      .replace(/[^a-z ]/gi, '')
      .split(' ')
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  );
</script>

<svg
  class="mark"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  role="img"
  aria-label={label}
  style:color={colour}
>
  {#if path}
    <path d={path} fill="currentColor" />
  {:else}
    <rect
      x="1.5"
      y="1.5"
      width="21"
      height="21"
      rx="6"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    />
    <text
      x="12"
      y="12.5"
      text-anchor="middle"
      dominant-baseline="central"
      fill="currentColor"
      font-size={initials.length > 1 ? 9 : 12}
      font-weight="600"
      font-family="var(--sans)"
    >
      {initials}
    </text>
  {/if}
</svg>

<style>
  .mark {
    flex: none;
    display: block;
  }
</style>
