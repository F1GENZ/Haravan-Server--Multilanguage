import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module';
import { HaravanModule } from './haravan/haravan.module';
import { MetafieldModule } from './metafield/metafield.module';
import { DataModule } from './data/data.module';
import { TokenModule } from './token/token.module';
import { QueueModule } from './queue/queue.module';

@Module({ 
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    QueueModule, // Add Queue module
    RedisModule,
    HaravanModule,
    MetafieldModule,
    DataModule,
    TokenModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
