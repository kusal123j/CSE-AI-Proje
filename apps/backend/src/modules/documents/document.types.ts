export type DocumentType = 'ANNUAL_REPORT' | 'INTERIM_REPORT' | 'ANNOUNCEMENT' | 'CIRCULAR' | 'OTHER';

export type DocumentStatus =
  | 'DISCOVERED'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'STORED'
  | 'EXTRACTING'
  | 'EXTRACTED'
  | 'CHUNKING'
  | 'CHUNKED'
  | 'EMBEDDING'
  | 'EMBEDDED'
  | 'ANALYZING'
  | 'ANALYZED'
  | 'DUPLICATE'
  | 'FAILED';
