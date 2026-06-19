import { createJob } from '../repositories/monitorJob.repository';
import { listActiveMonitoredUrls, markMonitoredUrlScheduled } from '../repositories/monitoredUrl.repository';
import { canAcceptNewJob, enqueueMonitorJobProcessing } from './monitorJob.service';

type Logger = {
  debug: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

let isDailyMonitoringRunning = false;

export async function runDailyMonitoring(logger?: Logger): Promise<{ scheduled: number; skipped: number; failed: number }> {
  if (isDailyMonitoringRunning) {
    logger?.warn({}, 'Daily monitoring run skipped because a previous run is still active');
    return { scheduled: 0, skipped: 0, failed: 0 };
  }

  isDailyMonitoringRunning = true;
  let scheduled = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const monitoredUrls = await listActiveMonitoredUrls();
    logger?.info({ total: monitoredUrls.length }, 'Daily monitoring run started');

    for (const monitoredUrl of monitoredUrls) {
      if (!canAcceptNewJob()) {
        skipped++;
        logger?.warn({ monitoredUrlId: monitoredUrl.id }, 'Daily monitoring skipped URL because queue is at capacity');
        continue;
      }

      try {
        const job = await createJob(monitoredUrl.pageId, monitoredUrl.apiKeyId);
        await markMonitoredUrlScheduled(monitoredUrl.id);
        enqueueMonitorJobProcessing(job.id, logger);
        scheduled++;
      } catch (error) {
        failed++;
        logger?.error(
          { monitoredUrlId: monitoredUrl.id, apiKeyId: monitoredUrl.apiKeyId, url: monitoredUrl.url, error: String(error) },
          'Daily monitoring failed to schedule URL',
        );
      }
    }

    logger?.info({ scheduled, skipped, failed }, 'Daily monitoring run finished');
    return { scheduled, skipped, failed };
  } finally {
    isDailyMonitoringRunning = false;
  }
}
