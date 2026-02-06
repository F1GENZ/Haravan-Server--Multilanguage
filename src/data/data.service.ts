import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { HaravanAPIService } from 'src/haravan/haravan.api';

@Injectable()
export class DataService {
  constructor(private readonly haravanAPI: HaravanAPIService) { }

  // Collection methods
  async getCollections(token: string, params: any) {
    if (!token) throw new UnauthorizedException();
    return await this.haravanAPI.getCollections(token, params);
  }

  async getCollection(token: string, id: string) {
    if (!token) throw new UnauthorizedException();
    if (!id) throw new BadRequestException("Collection ID is required");
    return await this.haravanAPI.getCollection(token, id);
  }

  async createCollection(token: string, values: any) {
    if (!token) throw new UnauthorizedException();
    return await this.haravanAPI.createCollection(token, values);
  }

  async updateCollection(token: string, id: string, values: any) {
    if (!token) throw new UnauthorizedException();
    if (!id) throw new BadRequestException("Collection ID is required");
    return await this.haravanAPI.updateCollection(token, id, values);
  }

  async deleteCollection(token: string, id: string) {
    if (!token) throw new UnauthorizedException();
    if (!id) throw new BadRequestException("Collection ID is required");
    return await this.haravanAPI.deleteCollection(token, id);
  }

  // Product methods
  async getProducts(token: string, params: any) {
    if (!token) throw new UnauthorizedException();
    return await this.haravanAPI.getProducts(token, params);
  }

  async getProductsCount(token: string) {
    if (!token) throw new UnauthorizedException();
    return await this.haravanAPI.getProductsCount(token);
  }

  async getProduct(token: string, id: string) {
    if (!token) throw new UnauthorizedException();
    if (!id) throw new BadRequestException("Product ID is required");
    return await this.haravanAPI.getProduct(token, id);
  }

  async createProduct(token: string, values: any) {
    if (!token) throw new UnauthorizedException();
    return await this.haravanAPI.createProduct(token, values);
  }

  async updateProduct(token: string, id: string, values: any) {
    if (!token) throw new UnauthorizedException();
    if (!id) throw new BadRequestException("Product ID is required");
    return await this.haravanAPI.updateProduct(token, id, values);
  }

  async deleteProduct(token: string, id: string) {
    if (!token) throw new UnauthorizedException();
    if (!id) throw new BadRequestException("Product ID is required");
    return await this.haravanAPI.deleteProduct(token, id);
  }
}