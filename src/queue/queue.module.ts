import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq'; 
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
      inject: [ConfigService],
    }),
    // Metafield Queue - xử lý create/update/delete hàng loạt
    BullModule.registerQueue({
      name: 'metafield',
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
