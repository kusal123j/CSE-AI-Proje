import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { cseService } from './cse.service';
import { cseCompanyIntelligenceService } from './cse.companyIntelligence.service';

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

function shouldRunDailyMarketSummaryNow(date = new Date()): boolean {
  if (!env.CSE_DAILY_MARKET_SUMMARY_SCHEDULER_ENABLED) return false;
  if (env.CSE_DAILY_MARKET_SUMMARY_WEEKDAYS_ONLY && !isWeekdaySriLanka(date)) return false;
  const { hour, minute } = currentSriLankaHourMinute(date);
  return hour === env.CSE_DAILY_MARKET_SUMMARY_HOUR && minute === env.CSE_DAILY_MARKET_SUMMARY_MINUTE;
}

function shouldRunCompanyFinancialReportsNow(date = new Date()): boolean {
  if (!env.CSE_COMPANY_FINANCIAL_REPORTS_SCHEDULER_ENABLED) return false;
  if (env.CSE_COMPANY_FINANCIAL_REPORTS_WEEKDAYS_ONLY && !isWeekdaySriLanka(date)) return false;
  const { hour, minute } = currentSriLankaHourMinute(date);
  return hour === env.CSE_COMPANY_FINANCIAL_REPORTS_HOUR && minute === env.CSE_COMPANY_FINANCIAL_REPORTS_MINUTE;
}

function shouldRunCompanyAnnouncementsNow(date = new Date()): boolean {
  if (!env.CSE_COMPANY_ANNOUNCEMENTS_SCHEDULER_ENABLED) return false;
  if (env.CSE_COMPANY_ANNOUNCEMENTS_WEEKDAYS_ONLY && !isWeekdaySriLanka(date)) return false;
  const { hour, minute } = currentSriLankaHourMinute(date);
  return hour === env.CSE_COMPANY_ANNOUNCEMENTS_HOUR && minute === env.CSE_COMPANY_ANNOUNCEMENTS_MINUTE;
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

export function startCseDailyMarketSummaryScheduler(): { stop: () => void } | null {
  if (!env.CSE_DAILY_MARKET_SUMMARY_SCHEDULER_ENABLED) {
    logger.info('CSE Daily Market Summary scheduler disabled');
    return null;
  }

  let running = false;
  let lastRunKey = '';

  const interval = setInterval(() => {
    const now = new Date();
    const runKey = now.toISOString().slice(0, 16);
    if (!shouldRunDailyMarketSummaryNow(now) || running || lastRunKey === runKey) return;

    running = true;
    lastRunKey = runKey;
    cseService
      .runDailyMarketSummaryImport({ triggerType: 'scheduled' })
      .then((result) => logger.info({ result }, 'Scheduled CSE Daily Market Summary import completed'))
      .catch((error) => logger.error({ error }, 'Scheduled CSE Daily Market Summary import failed'))
      .finally(() => {
        running = false;
      });
  }, env.CSE_IMPORT_SCHEDULER_INTERVAL_MS);

  return {
    stop: () => clearInterval(interval)
  };
}



export function startCseCompanyFinancialReportsScheduler(): { stop: () => void } | null {
  if (!env.CSE_COMPANY_FINANCIAL_REPORTS_SCHEDULER_ENABLED) {
    logger.info('CSE Company Financial Reports scheduler disabled');
    return null;
  }

  let running = false;
  let lastRunKey = '';

  const interval = setInterval(() => {
    const now = new Date();
    const runKey = now.toISOString().slice(0, 16);
    if (!shouldRunCompanyFinancialReportsNow(now) || running || lastRunKey === runKey) return;

    running = true;
    lastRunKey = runKey;
    cseCompanyIntelligenceService
      .startFinancialReportsImport({ triggerType: 'scheduled' })
      .then((result) => logger.info({ result }, 'Scheduled CSE Company Financial Reports import started'))
      .catch((error) => logger.error({ error }, 'Scheduled CSE Company Financial Reports import failed'))
      .finally(() => {
        running = false;
      });
  }, env.CSE_IMPORT_SCHEDULER_INTERVAL_MS);

  return { stop: () => clearInterval(interval) };
}

export function startCseCompanyAnnouncementsScheduler(): { stop: () => void } | null {
  if (!env.CSE_COMPANY_ANNOUNCEMENTS_SCHEDULER_ENABLED) {
    logger.info('CSE Company Announcements scheduler disabled');
    return null;
  }

  let running = false;
  let lastRunKey = '';

  const interval = setInterval(() => {
    const now = new Date();
    const runKey = now.toISOString().slice(0, 16);
    if (!shouldRunCompanyAnnouncementsNow(now) || running || lastRunKey === runKey) return;

    running = true;
    lastRunKey = runKey;
    cseCompanyIntelligenceService
      .startAnnouncementsImport({ triggerType: 'scheduled' })
      .then((result) => logger.info({ result }, 'Scheduled CSE Company Announcements import started'))
      .catch((error) => logger.error({ error }, 'Scheduled CSE Company Announcements import failed'))
      .finally(() => {
        running = false;
      });
  }, env.CSE_IMPORT_SCHEDULER_INTERVAL_MS);

  return { stop: () => clearInterval(interval) };
}


function sriLankaMinutes(date = new Date()): number {
  const { hour, minute } = currentSriLankaHourMinute(date);
  return hour * 60 + minute;
}

function parseHourMinute(value: string): number {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function shouldPollLatestPricesNow(date = new Date()): boolean {
  if (!env.CSE_LATEST_PRICE_POLLER_ENABLED) return false;
  if (env.CSE_LATEST_PRICE_WEEKDAYS_ONLY && !isWeekdaySriLanka(date)) return false;
  const nowMinutes = sriLankaMinutes(date);
  return nowMinutes >= parseHourMinute(env.CSE_MARKET_OPEN_TIME) && nowMinutes <= parseHourMinute(env.CSE_MARKET_CLOSE_TIME);
}

export function startCseLatestPriceScheduler(): { stop: () => void } | null {
  if (!env.CSE_LATEST_PRICE_POLLER_ENABLED) {
    logger.info('CSE Latest Price poller disabled');
    return null;
  }

  let running = false;
  const interval = setInterval(() => {
    if (!shouldPollLatestPricesNow() || running) return;
    running = true;
    cseCompanyIntelligenceService
      .runLatestPricesImport({ triggerType: 'scheduled', insertSnapshot: true })
      .then((result) => logger.info({ result }, 'Scheduled CSE Latest Price poll completed'))
      .catch((error) => logger.error({ error }, 'Scheduled CSE Latest Price poll failed'))
      .finally(() => {
        running = false;
      });
  }, env.CSE_LATEST_PRICE_POLL_INTERVAL_MS);

  return { stop: () => clearInterval(interval) };
}

export function startCseCompanyProfileScheduler(): { stop: () => void } | null {
  if (!env.CSE_COMPANY_PROFILE_SCHEDULER_ENABLED) {
    logger.info('CSE Company Profile scheduler disabled');
    return null;
  }

  let running = false;
  const interval = setInterval(() => {
    if (running) return;
    running = true;
    cseCompanyIntelligenceService
      .startCompanyProfilesImport({ triggerType: 'scheduled' })
      .then((result) => logger.info({ result }, 'Scheduled CSE Company Profile import started'))
      .catch((error) => logger.error({ error }, 'Scheduled CSE Company Profile import failed'))
      .finally(() => {
        running = false;
      });
  }, env.CSE_COMPANY_PROFILE_REFRESH_HOURS * 60 * 60 * 1000);

  return { stop: () => clearInterval(interval) };
}
