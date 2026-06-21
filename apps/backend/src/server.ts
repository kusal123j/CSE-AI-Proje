import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeDatabase } from './config/database';
import { ensureMinioBucket } from './config/minio';
import { ensureQdrantCollection } from './config/qdrant';
import { runMigrations } from './database/migrate';
import { startDocumentDownloadWorker } from './queues/documentDownload.queue';
import { startPdfExtractWorker } from './queues/pdfExtract.queue';
import { startCseAlphabeticalScheduler, startCseDailyMarketSummaryScheduler, startCseTradeSummaryScheduler } from './modules/cse/cse.scheduler';

async function bootstrap() {
  if (env.RUN_MIGRATIONS_ON_START) {
    await runMigrations();
  }

  await ensureMinioBucket();
  await ensureQdrantCollection().catch((error) => {
    logger.warn({ error }, 'Qdrant collection preparation failed; health endpoint will show degraded status');
  });

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'CSE research backend started');
  });

  const workers = [startDocumentDownloadWorker(), startPdfExtractWorker()];
  const cseScheduler = startCseAlphabeticalScheduler();
  const cseTradeSummaryScheduler = startCseTradeSummaryScheduler();
  const cseDailyMarketSummaryScheduler = startCseDailyMarketSummaryScheduler();

  async function shutdown(signal: string) {
    logger.info({ signal }, 'Shutting down backend');
    server.close();
    cseScheduler?.stop();
    cseTradeSummaryScheduler?.stop();
    cseDailyMarketSummaryScheduler?.stop();
    await Promise.all(workers.map((worker) => worker.close()));
    await closeDatabase();
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.error({ error }, 'Backend startup failed');
  process.exit(1);
});
