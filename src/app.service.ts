import { Injectable } from '@nestjs/common';
import { RedisService } from './redis/redis.service';

@Injectable()
export class AppService {
  constructor(private readonly redisService: RedisService) {}
  async getHello(): Promise<string> {
    await this.redisService.set('greeting', 'Hello World!', 60);
    return 'Hello World!';
  }
}
  