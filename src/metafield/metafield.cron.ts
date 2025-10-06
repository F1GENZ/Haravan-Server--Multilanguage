// filepath: d:\Collection Tabs\server\src\haravan\haravan.cron.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs'; 
import { map, catchError } from 'rxjs/operators';

@Injectable() 
export class MetafieldCronService {
  private readonly logger = new Logger(MetafieldCronService.name);
  constructor(private httpService: HttpService) { }
  
  @Cron(CronExpression.EVERY_30_SECONDS)
  async cronToGetCurrency() {
    // const currency = await firstValueFrom(
    //   this.httpService.get('https://cdn.shopify.com/s/javascripts/currencies.js').pipe(
    //     map((response) => response.data),
    //     catchError((error) => {
    //       throw new Error(`API error: ${error.message}`);
    //     }),
    //   )
    // );
    // console.log(currency);
  }
}