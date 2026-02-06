import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { RedisModule } from '../redis/redis.module';
import { HaravanModule } from '../haravan/haravan.module';

@Module({
  imports: [RedisModule, HaravanModule],
  controllers: [TranslateController],
  providers: [TranslateService],
  exports: [TranslateService],
})
export class TranslateModule {}
