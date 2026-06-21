import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { healthRoutes } from './modules/health/health.routes';
import { companyRoutes } from './modules/companies/company.routes';
import { documentRoutes } from './modules/documents/document.routes';
import { cseCollectorRoutes } from './modules/cseCollector/cseCollector.routes';
import { jobRoutes } from './modules/jobs/job.routes';
import { storageRoutes } from './modules/storage/storage.routes';
import { aiRoutes } from './modules/ai/ai.routes';
import { cseRoutes } from './modules/cse/cse.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', service: 'cse-research-backend' } });
  });

  app.use('/api/health', healthRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/cse-collector', cseCollectorRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/storage', storageRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/cse', cseRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
