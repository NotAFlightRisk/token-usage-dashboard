import { scan } from './scan';
import { refreshClaudeWindows } from './windows';
import { settings } from './settings';
import { usage } from './queries';
import { resolveRange } from '../range';
import { describe, report, resolve } from './problems';

let timer: NodeJS.Timeout | null = null;

export async function refresh(force = false): Promise<void> {
  await Promise.all([
    scan().then(
      () => resolve('scan'),
      (error) =>
        report({
          id: 'scan',
          level: 'error',
          scope: 'Scan',
          message: 'The scan stopped early',
          hint: describe(error)
        })
    ),
    refreshClaudeWindows(force)
  ]);
  warm();
}

/** Pay for the first rollup here, not on the next visitor's page load. */
function warm(): void {
  const { from, to, range } = resolveRange(settings().range);
  usage({ from, to, range, tools: [], models: [], projects: [] });
}

/** Starts the rescans, or swaps them onto whatever interval is saved now */
export function schedule(): void {
  if (timer) clearInterval(timer);
  const every = Math.max(15, settings().scanIntervalSec) * 1000;
  timer = setInterval(() => void refresh(), every);
  timer.unref?.();
}

export function boot(): void {
  if (timer) return;
  schedule();
  void refresh();
}
