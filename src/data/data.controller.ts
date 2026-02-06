import { Controller, Get, Post, Put, Body, Query, UseGuards, Delete, Logger, Param } from '@nestjs/common';
import { DataService } from './data.service';
import { ShopAuth } from '../common/decorators/shop-auth.decorator';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';

@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) { }

  // Collection endpoints
  @UseGuards(ShopAuthGuard)
  @Get('collections')
  async getCollections(@ShopAuth() token, @Query() query) {
    const { limit, page, published_status } = query;
    return {
      success: true,
      data: await this.dataService.getCollections(token, { limit, page, published_status }),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Get('collections/:id')
  async getCollection(@ShopAuth() token, @Param('id') id: string) {
    return {
      success: true,
      data: await this.dataService.getCollection(token, id),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Post('collections')
  async createCollection(@ShopAuth() token, @Body() body) {
    return {
      success: true,
      data: await this.dataService.createCollection(token, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Put('collections/:id')
  async updateCollection(@ShopAuth() token, @Param('id') id: string, @Body() body) {
    return {
      success: true,
      data: await this.dataService.updateCollection(token, id, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Delete('collections/:id')
  async deleteCollection(@ShopAuth() token, @Param('id') id: string) {
    return {
      success: true,
      data: await this.dataService.deleteCollection(token, id),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  // Product endpoints
  @UseGuards(ShopAuthGuard)
  @Get('products/count')
  async getProductsCount(@ShopAuth() token) {
    return {
      success: true,
      data: await this.dataService.getProductsCount(token),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Get('products')
  async getProducts(@ShopAuth() token, @Query() query) {
    const { limit, page, published_status, collection_id } = query;
    return {
      success: true,
      data: await this.dataService.getProducts(token, { limit, page, published_status, collection_id }),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Get('products/:id')
  async getProduct(@ShopAuth() token, @Param('id') id: string) {
    return {
      success: true,
      data: await this.dataService.getProduct(token, id),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Post('products')
  async createProduct(@ShopAuth() token, @Body() body) {
    return {
      success: true,
      data: await this.dataService.createProduct(token, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Put('products/:id')
  async updateProduct(@ShopAuth() token, @Param('id') id: string, @Body() body) {
    return {
      success: true,
      data: await this.dataService.updateProduct(token, id, body),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }

  @UseGuards(ShopAuthGuard)
  @Delete('products/:id')
  async deleteProduct(@ShopAuth() token, @Param('id') id: string) {
    return {
      success: true,
      data: await this.dataService.deleteProduct(token, id),
      status: 200,
      errorCode: null,
      errorMessage: null,
    };
  }
}