import { BadRequestException } from '@nestjs/common/exceptions';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import axios from 'axios';
import { console } from 'inspector';

@Injectable()
export class HaravanAPIService {
  constructor(private readonly configService: ConfigService) { }

  async subscribeWebhook(access_token) {
    const subscribeHook = await axios.post("https://webhook.haravan.com/api/subscribe", {}, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      }
    });
    if (!subscribeHook.data) throw new BadRequestException("Failed to subscribe to webhooks");
    return "Webhook subscribed successfully";
  }

  async unsubscribeWebhook(access_token) {
    const unsubscribeHook = await axios.post("https://webhook.haravan.com/api/unsubscribe", {}, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      }
    });
    if (!unsubscribeHook.data) throw new BadRequestException("Failed to unsubscribe from webhooks");
    return "Webhook unsubscribed successfully";
  }

  async getScriptTags(access_token) {
    const response = await axios.get("https://apis.haravan.com/web/script_tags.json?src=" + this.configService.get('HRV_URL_SCRIPT_TAGS'), {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    if (!response.data || !response.data.script_tags) throw new BadRequestException("Failed to fetch script tags");
    return response.data.script_tags[0];
  }

  async getProduct(access_token, product_id) {
    const response = await axios.get(`https://apis.haravan.com/com/products/${product_id}.json`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    if (!response.data || !response.data.product) throw new BadRequestException("Failed to fetch product");
    return response.data.product;
  }

  async importScriptTags(access_token) {
    const existingTags = await this.getScriptTags(access_token);
    if (existingTags && existingTags.id) {
      return existingTags; // Script tag already exists, no need to create a new one
    } else {
      const response = await axios.post("https://apis.haravan.com/web/script_tags.json", {
        script_tag: {
          event: "onload",
          src: this.configService.get('HRV_URL_SCRIPT_TAGS'),
        },
      }, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      });
      if (!response.data || !response.data.script_tag) throw new BadRequestException("Failed to create script tag");
      return response.data.script_tag;
    }
  }

  async deleteScriptTags(access_token, script_tag_id) {
    const response = await axios.delete(`https://apis.haravan.com/web/script_tags/${script_tag_id}.json`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    if (!response.data) throw new BadRequestException("Failed to delete script tag");
    return "Script tag deleted successfully";
  }

  async getRates() {
    const responseRates = await axios.get("https://openexchangerates.org/api/latest.json?app_id=7256385e23e346c09a23d7fce419a954");
    if (!responseRates.data || !responseRates.data.rates) throw new BadRequestException("Failed to fetch exchange rates");
    return responseRates.data.rates;
  }

  async importMetafieldsRates(access_token) {
    const rates = await this.getRates();
    const responseMetafields = await axios.post("https://apis.haravan.com/com/metafields.json", {
      metafields: {
        namespace: "currency",
        key: "rates",
        value: JSON.stringify(rates),
        value_type: "json"
      }
    }, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!responseMetafields.data) throw new BadRequestException("Failed to import metafields");
    return true;
  }

  async getMetafields(token: string, type: string, namespace: string, objectid: string) {
    if (!token) throw new BadRequestException("Token is required");
    if (!type) throw new BadRequestException("Type is required");
    if (!namespace) throw new BadRequestException("Namespace is required");
    if (!objectid) throw new BadRequestException("Object ID is required");

    let queryString = "";
    switch (type) {
      case "shop":
        queryString = `https://apis.haravan.com/com/metafields.json?owner_resource=shop&namespace=${namespace}`;
        break;
      default:
        queryString = `https://apis.haravan.com/com/metafields.json?owner_id=${objectid}&namespace=${namespace}`;
        break;
    }

    const response = await axios.get(
      queryString,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!response.data || !response.data.metafields) throw new BadRequestException("Failed to fetch metafields");
    return response.data.metafields;
  }

  async createMetafields(token: string, values) {
    if (!token) throw new BadRequestException("Token is required");
    const { type, objectid, namespace, key, value, value_type, description } = values;
    
    // Determine if we need to stringify the value
    // For translation metafields (hrvmultilang_*), value is already a string
    // For config metafields (hrvmultilang_config), value is an object that needs stringifying
    const shouldStringify = value_type === 'json' || (typeof value === 'object' && value !== null);
    
    const metafield = {
      namespace: namespace,
      key: key,
      value: shouldStringify ? JSON.stringify(value) : value,
      value_type: value_type || "string",
      ...(description && { description })
    };
    
    let queryString = ""; 
    switch (values.type) {
      case "shop":
        queryString = `https://apis.haravan.com/com/metafields.json?owner_resource=shop`;
        break;
      case "product":
        queryString = `https://apis.haravan.com/com/products/${objectid}/metafields.json`;
        break;
      case "collection":
        queryString = `https://apis.haravan.com/com/custom_collections/${objectid}/metafields.json`;
        break;
      default:
        queryString = `https://apis.haravan.com/com/${type}s/${objectid}/metafields.json`;
        break;
    }
    console.log('🔗 Creating metafield at:', queryString);
    console.log('📦 Metafield data:', metafield);
    
    const response = await axios.post(
      queryString,
      { metafield: metafield },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (!response.data || !response.data.metafield) throw new BadRequestException("Failed to create metafield");
    return response.data.metafield;
  }

  async updateMetafields(token: string, values) {
    if (!token) throw new BadRequestException("Token is required");
    const { type, objectid, metafieldid, value, value_type, description } = values;
    
    // Determine if we need to stringify the value
    const shouldStringify = value_type === 'json' || (typeof value === 'object' && value !== null);
    
    const metafield = {
      value: shouldStringify ? JSON.stringify(value) : value,
      value_type: value_type || 'string',
      ...(description && { description })
    };
    
    console.log('🔄 Updating metafield:', metafieldid);
    console.log('📦 Update data:', metafield);
    
    const response = await axios.put(
      `https://apis.haravan.com/com/metafields/${metafieldid}.json`,
      { metafield: metafield },
      { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    if (!response.data || !response.data.metafield) throw new BadRequestException("Failed to update metafield");
    return response.data.metafield;
  }

  async deleteMetafields(token: string, metafieldid: string) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.delete(`https://apis.haravan.com/com/metafields/${metafieldid}.json`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.data) throw new BadRequestException("Failed to delete metafield");
    return response.data;
  }

  // Collection methods
  async getCollections(token: string, params: any = {}) {
    if (!token) throw new BadRequestException("Token is required");
    
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.page) queryParams.append('page', params.page);
    if (params.published_status) queryParams.append('published_status', params.published_status);
    
    const url = `https://apis.haravan.com/com/custom_collections.json${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.data) throw new BadRequestException("Failed to fetch collections");
    return response.data;
  }

  async getCollection(token: string, id: string) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.get(`https://apis.haravan.com/com/custom_collections/${id}.json`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.data || !response.data.custom_collection) throw new BadRequestException("Failed to fetch collection");
    return response.data.custom_collection;
  }

  async createCollection(token: string, values: any) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.post(`https://apis.haravan.com/com/custom_collections.json`, values, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data) throw new BadRequestException("Failed to create collection");
    return response.data;
  }

  async updateCollection(token: string, id: string, values: any) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.put(`https://apis.haravan.com/com/custom_collections/${id}.json`, values, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data) throw new BadRequestException("Failed to update collection");
    return response.data;
  }

  async deleteCollection(token: string, id: string) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.delete(`https://apis.haravan.com/com/custom_collections/${id}.json`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.data) throw new BadRequestException("Failed to delete collection");
    return response.data;
  }

  // Product methods
  async getProducts(token: string, params: any = {}) {
    if (!token) throw new BadRequestException("Token is required");
    
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.page) queryParams.append('page', params.page);
    if (params.published_status) queryParams.append('published_status', params.published_status);
    if (params.collection_id) queryParams.append('collection_id', params.collection_id);
    
    const url = `https://apis.haravan.com/com/products.json${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.data) throw new BadRequestException("Failed to fetch products");
    return response.data;
  }

  async createProduct(token: string, values: any) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.post(`https://apis.haravan.com/com/products.json`, values, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data) throw new BadRequestException("Failed to create product");
    return response.data;
  }

  async updateProduct(token: string, id: string, values: any) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.put(`https://apis.haravan.com/com/products/${id}.json`, values, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data) throw new BadRequestException("Failed to update product");
    return response.data;
  }

  async deleteProduct(token: string, id: string) {
    if (!token) throw new BadRequestException("Token is required");
    const response = await axios.delete(`https://apis.haravan.com/com/products/${id}.json`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.data) throw new BadRequestException("Failed to delete product");
    return response.data;
  }
}