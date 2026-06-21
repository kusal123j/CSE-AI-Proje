import { AppError } from '../../../middleware/errorHandler';

export async function retrieveRelevantChunks(_input: { documentId?: string; question: string }) {
  // Foundation placeholder.
  throw new AppError(501, 'Retriever is not implemented in foundation v1');
}
