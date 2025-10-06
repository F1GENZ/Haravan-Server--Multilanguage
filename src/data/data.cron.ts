import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs'; 
import { map, catchError } from 'rxjs/operators';

@Injectable() 
export class DataCronService {
  private readonly logger = new Logger(DataCronService.name);
  constructor(private httpService: HttpService) { }
  
  // Example cron job for syncing data - you can customize this based on your needs
  @Cron(CronExpression.EVERY_HOUR)
  async syncProductData() {
    this.logger.log('Starting product data sync...');
    // Add your sync logic here
    // Example: sync product prices, inventory, etc.
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async syncCollectionData() {
    this.logger.log('Starting collection data sync...');
    // Add your sync logic here
    // Example: sync collection information, product counts, etc.
  }
}