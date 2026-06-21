import { AppError } from '../../../middleware/errorHandler';
import { documentService } from '../../documents/document.service';
import { splitPagesIntoChunks } from './textSplitter.service';
import { prepareQdrantCollection } from './qdrantVectorStore.service';

export const ragService = {
  async prepareCollection() {
    return prepareQdrantCollection();
  },

  async chunkDocument(documentId: string) {
    const pages = await documentService.pages(documentId);
    if (!pages.length) {
      throw new AppError(400, 'Document has no extracted pages to chunk');
    }

    const chunks = await splitPagesIntoChunks(
      pages.map((page: any) => ({ pageNumber: page.page_number, text: page.text }))
    );

    return {
      documentId,
      pages: pages.length,
      chunks: chunks.length,
      sample: chunks.slice(0, 3)
    };
  },

  async embedDocument(_documentId: string) {
    throw new AppError(501, 'Document embedding is not implemented in foundation v1');
  },

  async askDocument(_documentId: string, _question: string) {
    throw new AppError(501, 'Document Q&A is not implemented in foundation v1');
  },

  async summarizeDocument(_documentId: string) {
    throw new AppError(501, 'AI summary is not implemented in foundation v1');
  }
};
