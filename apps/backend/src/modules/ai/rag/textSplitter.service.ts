import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export interface PageTextForChunking {
  pageNumber: number;
  text: string;
}

export interface ChunkResult {
  pageNumber: number;
  chunkIndex: number;
  text: string;
}

export async function splitPagesIntoChunks(pages: PageTextForChunking[]): Promise<ChunkResult[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1200,
    chunkOverlap: 180
  });

  const chunks: ChunkResult[] = [];

  for (const page of pages) {
    const split = await splitter.splitText(page.text || '');
    split.forEach((text, index) => {
      chunks.push({ pageNumber: page.pageNumber, chunkIndex: index, text });
    });
  }

  return chunks;
}
