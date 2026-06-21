import { Readable } from 'node:stream';
import { stat } from 'node:fs/promises';
import { minioClient, ensureMinioBucket } from '../../config/minio';
import { env } from '../../config/env';
import { safeFileName } from '../../utils/slugify';

export const storageService = {
  async ensureBucket() {
    await ensureMinioBucket();
    return { bucket: env.MINIO_BUCKET, ready: true };
  },

  buildObjectKey(input: {
    symbol: string;
    documentType: string;
    financialYear?: string | null;
    documentId: string;
    fileName: string;
  }): string {
    const year = input.financialYear || 'unknown-year';
    return [
      'companies',
      input.symbol.toUpperCase(),
      input.documentType,
      year,
      input.documentId,
      safeFileName(input.fileName)
    ].join('/');
  },

  async uploadBuffer(objectKey: string, buffer: Buffer, contentType = 'application/pdf') {
    await ensureMinioBucket();
    await minioClient.putObject(env.MINIO_BUCKET, objectKey, buffer, buffer.length, {
      'Content-Type': contentType
    });
    return { bucket: env.MINIO_BUCKET, objectKey, size: buffer.length };
  },

  async downloadStream(bucket: string, objectKey: string): Promise<Readable> {
    return minioClient.getObject(bucket, objectKey);
  },

  async objectExists(bucket: string, objectKey: string): Promise<boolean> {
    try {
      await minioClient.statObject(bucket, objectKey);
      return true;
    } catch {
      return false;
    }
  },

  async localFileSize(path: string): Promise<number> {
    const info = await stat(path);
    return info.size;
  }
};
