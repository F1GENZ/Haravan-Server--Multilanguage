// redis.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import Redis from 'ioredis';


@Global() // giúp module có thể dùng toàn app mà không cần import nhiều nơi
@Module({
  imports: [ConfigModule], 
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        });
      },
    },
    RedisService, 
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule { }
