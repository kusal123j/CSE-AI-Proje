import { qdrantClient, ensureQdrantCollection } from '../../../config/qdrant';
import { env } from '../../../config/env';

export async function prepareQdrantCollection() {
  await ensureQdrantCollection();
  return {
    collection: env.QDRANT_COLLECTION,
    ready: true
  };
}

export async function getQdrantCollectionInfo() {
  await ensureQdrantCollection();
  return qdrantClient.getCollection(env.QDRANT_COLLECTION);
}
