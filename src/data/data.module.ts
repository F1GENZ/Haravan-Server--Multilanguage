import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { DataCronService } from './data.cron';
import { HaravanModule } from '../haravan/haravan.module';

@Module({
  imports: [HttpModule, HaravanModule],
  controllers: [DataController],
  providers: [DataService, DataCronService]
})
export class DataModule {}