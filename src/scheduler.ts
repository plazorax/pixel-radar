import cron from 'node-cron';
import type { ResolvedConfig } from './config.js';
import type { Runner } from './runner.js';
import { LOG_PREFIX } from './shared/app.js';
import { isFailure } from './shared/status.js';

/**
 * Starts the optional in-process schedule (`"schedule"` in the config; validated by parseConfig).
 * Returns a stop function.
 */
export function startSchedule(config: ResolvedConfig, runner: Runner): (() => void) | null {
  if (!config.schedule) return null;
  let running = false;
  const task = cron.schedule(config.schedule, async () => {
    if (running) {
      console.log(`${LOG_PREFIX} scheduled check skipped: previous run still in progress`);
      return;
    }
    running = true;
    try {
      const results = await runner.run('check', config.sites);
      const failing = results.filter((result) => isFailure(result.status)).length;
      console.log(`${LOG_PREFIX} scheduled check done: ${results.length} checked, ${failing} need attention`);
    } catch (error) {
      console.error(`${LOG_PREFIX} scheduled check failed:`, error);
    } finally {
      running = false;
    }
  });
  return () => void task.stop();
}
