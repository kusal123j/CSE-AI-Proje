import { env } from '../../config/env';
import { DocumentType } from '../documents/document.types';

export interface CseDocumentCandidate {
  title: string;
  sourceUrl: string;
  sourceDocumentId?: string | null;
  documentType: DocumentType;
  financialYear?: string | null;
  period?: string | null;
  publishedDate?: string | null;
  fileName?: string | null;
}

export async function fetchDocumentsFromCse(
  symbol: string,
  documentType: DocumentType
): Promise<CseDocumentCandidate[]> {
  // Foundation adapter boundary.
  // Milestone 2 should replace this with official CSE source discovery.
  if (!env.CSE_MOCK_MODE) {
    return [];
  }

  return [
    {
      title: `${symbol} ${documentType} Mock Document`,
      sourceUrl: `https://example.com/${symbol.toLowerCase()}-${documentType.toLowerCase()}.pdf`,
      sourceDocumentId: `mock-${symbol}-${documentType}`,
      documentType,
      financialYear: new Date().getFullYear().toString(),
      period: null,
      publishedDate: null,
      fileName: `${symbol.toLowerCase()}-${documentType.toLowerCase()}.pdf`
    }
  ];
}
