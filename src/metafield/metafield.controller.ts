import { Controller, Get, Post, Put, Body, Query, UseGuards, Delete, Logger, Param } from '@nestjs/common';
import { MetafieldService } from './metafield.service';
import { ShopAuth } from '../common/decorators/shop-auth.decorator';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';

@Controller('metafields')
export class MetafieldController {
  constructor(private readonly metafieldService: MetafieldService) { }
  
  @UseGuards(ShopAuthGuard)
  @Get()
  async getMetafields(@ShopAuth() token, @Query() query) {
    const { type, namespace, objectid } = query;
    return {
      success: true,
      data: await this.metafieldService.getMetafields(token, type, namespace, objectid),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Post()
  async createMetafields(@ShopAuth() token, @Body() body) {
    return {
      success: true,
      data: await this.metafieldService.createMetafields(token, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Put()
  async updateMetafields(@ShopAuth() token, @Body() body) {
    return {
      success: true,
      data: await this.metafieldService.updateMetafields(token, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard) 
  @Delete()
  async deleteMetafields(@ShopAuth() token, @Query() query) {
    const { metafieldid } = query;
    return {
      success: true,
      data: await this.metafieldService.deleteMetafields(token, metafieldid),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  /**
   * Queue endpoints - Async operations
   */
  @UseGuards(ShopAuthGuard)
  @Post('queue/create')
  async queueCreateMetafield(@ShopAuth() token, @Body() body) {
    return {
      success: true,
      data: await this.metafieldService.queueCreateMetafield(token, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Post('queue/update')
  async queueUpdateMetafield(@ShopAuth() token, @Body() body) {
    return {
      success: true,
      data: await this.metafieldService.queueUpdateMetafield(token, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Post('queue/batch')
  async queueBatchMetafields(@ShopAuth() token, @Body() body) {
    const { operations } = body;
    return {
      success: true,
      data: await this.metafieldService.queueBatchMetafields(token, operations),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Get('queue/status/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    return {
      success: true,
      data: await this.metafieldService.getJobStatus(jobId),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }
}
