import { Module } from '@nestjs/common';
import { HaravanController } from './haravan.controller';
import { HaravanService } from './haravan.service';
import { HaravanAPIService } from './haravan.api';
import { HaravanCronService } from './haravan.cron';

@Module({
  controllers: [HaravanController],
  providers: [HaravanService, HaravanAPIService, HaravanCronService],
  exports: [HaravanService, HaravanAPIService, HaravanCronService]
})
export class HaravanModule {}
