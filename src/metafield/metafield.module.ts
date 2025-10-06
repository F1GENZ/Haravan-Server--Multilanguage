import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq'; 
import { MetafieldController } from './metafield.controller';
import { MetafieldService } from './metafield.service';
import { MetafieldCronService } from './metafield.cron';
import { HaravanModule } from '../haravan/haravan.module';
import { MetafieldProcessor } from '../queue/metafield.processor';

@Module({
  imports: [
    HttpModule, 
    HaravanModule,
    BullModule.registerQueue({
      name: 'metafield',
    }),
  ],
  controllers: [MetafieldController],
  providers: [MetafieldService, MetafieldCronService, MetafieldProcessor],
  exports: [MetafieldService],
})
export class MetafieldModule {}
  