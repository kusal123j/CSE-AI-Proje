import { AppError } from '../../../middleware/errorHandler';

export async function generateEmbeddings(_texts: string[]): Promise<number[][]> {
  // Foundation placeholder.
  // Add provider-specific embeddings in the AI Summary/RAG milestone.
  throw new AppError(501, 'Embedding generation is not implemented in foundation v1');
}
