import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from './env';

export const qdrantClient = new QdrantClient({ url: env.QDRANT_URL });

export async function checkQdrant(): Promise<boolean> {
  await qdrantClient.getCollections();
  return true;
}

export async function ensureQdrantCollection(): Promise<void> {
  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.some((collection) => collection.name === env.QDRANT_COLLECTION);

  if (!exists) {
    await qdrantClient.createCollection(env.QDRANT_COLLECTION, {
      vectors: {
        size: env.QDRANT_VECTOR_SIZE,
        distance: 'Cosine'
      }
    });
  }
}
