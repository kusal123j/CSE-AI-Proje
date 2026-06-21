import IORedis from 'ioredis';
import { env } from './env';

export const redisConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null as null
};

export function createRedisConnection(): IORedis {
  return new IORedis(redisConnectionOptions);
}

export const redis = createRedisConnection();

export async function checkRedis(): Promise<boolean> {
  const pong = await redis.ping();
  return pong === 'PONG';
}
