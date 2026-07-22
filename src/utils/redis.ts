/**
 * Redis Client 初始化模組
 * 
 * 負責載入 REDIS_URL 環境變數，
 * 建立與 Redis 的連線單例並導出，供 DAL (CacheRepository / LockRepository) 複用。
 */
import Redis from 'ioredis';
import { otelLogger } from './otelLogger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

if (!process.env.REDIS_URL) {
  console.warn('⚠️  Warning: REDIS_URL is not set. Defaulting to redis://localhost:6379.');
}

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('⚡ [Redis] Client connecting to Redis...');
});

redis.on('ready', () => {
  console.log('✅ [Redis] Connection established and ready.');
});

redis.on('error', (err) => {
  console.error('❌ [Redis] Client Error:', err.message);
  otelLogger.error('[Redis Client Error]', err);
});

export default redis;
