import { Module } from '@nestjs/common';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { GatewayController } from './gateway/gateway.controller';

const DEFAULT_LIMIT = Math.max(1, Number(process.env.RATE_LIMIT_PER_MIN ?? 60));

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: seconds(60),
          limit: DEFAULT_LIMIT,
        },
      ],
      storage: new ThrottlerStorageRedisService(
        new Redis(process.env.REDIS_URL!),
      ),
    }),
  ],
  controllers: [GatewayController],
})
export class AppModule {}
