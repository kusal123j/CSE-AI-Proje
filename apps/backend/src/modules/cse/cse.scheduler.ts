import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { cseService } from './cse.service';

function isWeekdaySriLanka(date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Colombo', weekday: 'short' }).format(date);
  return !['Sat', 'Sun'].includes(weekday);
}

function shouldRunNow(date = new Date()): boolean {
  if (!env.CSE_IMPORT_SCHEDULER_ENABLED) return false;
  if (env.CSE_IMPORT_WEEKDAYS_ONLY && !isWeekdaySriLanka(date)) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? -1);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? -1);
  return hour === env.CSE_IMPORT_HOUR && minute === env.CSE_IMPORT_MINUTE;
}

export function startCseAlphabeticalScheduler(): { stop: () => void } | null {
  if (!env.CSE_IMPORT_SCHEDULER_ENABLED) {
    logger.info('CSE ALPHABETICAL scheduler disabled');
    return null;
  }

  let running = false;
  let lastRunKey = '';

  const interval = setInterval(() => {
    const now = new Date();
    const runKey = now.toISOString().slice(0, 16);
    if (!shouldRunNow(now) || running || lastRunKey === runKey) return;

    running = true;
    lastRunKey = runKey;
    cseService
      .runAlphabeticalImport()
      .then((result) => logger.info({ result }, 'Scheduled CSE ALPHABETICAL import completed'))
      .catch((error) => logger.error({ error }, 'Scheduled CSE ALPHABETICAL import failed'))
      .finally(() => {
        running = false;
      });
  }, env.CSE_IMPORT_SCHEDULER_INTERVAL_MS);

  return {
    stop: () => clearInterval(interval)
  };
}
