import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { cseService } from './cse.service';

function isWeekdaySriLanka(date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Colombo', weekday: 'short' }).format(date);
  return !['Sat', 'Sun'].includes(weekday);
}

function currentSriLankaHourMinute(date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? -1),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? -1)
  };
}

function shouldRunAlphabeticalNow(date = new Date()): boolean {
  if (!env.CSE_IMPORT_SCHEDULER_ENABLED) return false;
  if (env.CSE_IMPORT_WEEKDAYS_ONLY && !isWeekdaySriLanka(date)) return false;
  const { hour, minute } = currentSriLankaHourMinute(date);
  return hour === env.CSE_IMPORT_HOUR && minute === env.CSE_IMPORT_MINUTE;
}

function shouldRunTradeSummaryNow(date = new Date()): boolean {
  if (!env.CSE_TRADE_SUMMARY_SCHEDULER_ENABLED) return false;
  if (env.CSE_TRADE_SUMMARY_WEEKDAYS_ONLY && !isWeekdaySriLanka(date)) return false;
  const { hour, minute } = currentSriLankaHourMinute(date);
  return hour === env.CSE_TRADE_SUMMARY_HOUR && minute === env.CSE_TRADE_SUMMARY_MINUTE;
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
    if (!shouldRunAlphabeticalNow(now) || running || lastRunKey === runKey) return;

    running = true;
    lastRunKey = runKey;
    cseService
      .runAlphabeticalImport({ triggerType: 'scheduled' })
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

export function startCseTradeSummaryScheduler(): { stop: () => void } | null {
  if (!env.CSE_TRADE_SUMMARY_SCHEDULER_ENABLED) {
    logger.info('CSE Trade Summary scheduler disabled');
    return null;
  }

  let running = false;
  let lastRunKey = '';

  const interval = setInterval(() => {
    const now = new Date();
    const runKey = now.toISOString().slice(0, 16);
    if (!shouldRunTradeSummaryNow(now) || running || lastRunKey === runKey) return;

    running = true;
    lastRunKey = runKey;
    cseService
      .runTradeSummaryImport({ triggerType: 'scheduled' })
      .then((result) => logger.info({ result }, 'Scheduled CSE Trade Summary import completed'))
      .catch((error) => logger.error({ error }, 'Scheduled CSE Trade Summary import failed'))
      .finally(() => {
        running = false;
      });
  }, env.CSE_IMPORT_SCHEDULER_INTERVAL_MS);

  return {
    stop: () => clearInterval(interval)
  };
}
