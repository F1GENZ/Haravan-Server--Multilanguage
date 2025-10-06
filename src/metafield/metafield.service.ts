import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { HaravanAPIService } from 'src/haravan/haravan.api';

@Injectable()
export class MetafieldService {
  constructor(
    private readonly haravanAPI: HaravanAPIService,
    @InjectQueue('metafield') private metafieldQueue: Queue,
  ) { }
  
  async getMetafields(token: string, type: string, namespace: string, objectid: string) {
    if (!token) throw new UnauthorizedException();
    if (!type) throw new BadRequestException("Type is required");
    if (!namespace) throw new BadRequestException("Namespace is required");
    if (!objectid) throw new BadRequestException("Object ID is required");
    return await this.haravanAPI.getMetafields(token, type, namespace, objectid);
  }

  async createMetafields(token: string, values) {
    if (!token) throw new UnauthorizedException();
    
    // Xử lý trực tiếp (sync) - giữ nguyên logic hiện tại
    return await this.haravanAPI.createMetafields(token, values);
  }
  
  async updateMetafields(token: string, values) {
    if (!token) throw new UnauthorizedException();
    
    // Xử lý trực tiếp (sync) - giữ nguyên logic hiện tại
    return await this.haravanAPI.updateMetafields(token, values);
  }

  async deleteMetafields(token: string, metafieldid: string) {
    if (!token) throw new UnauthorizedException();
    return await this.haravanAPI.deleteMetafields(token, metafieldid);
  }

  /**
   * Queue methods - sử dụng khi cần xử lý async
   */
  async queueCreateMetafield(token: string, values: any) {
    if (!token) throw new UnauthorizedException();
    
    const job = await this.metafieldQueue.add('process-metafield', {
      token,
      action: 'create',
      data: values,
    });
    
    return {
      jobId: job.id,
      status: 'queued',
      message: 'Metafield creation queued successfully',
    };
  }

  async queueUpdateMetafield(token: string, values: any) {
    if (!token) throw new UnauthorizedException();
    
    const job = await this.metafieldQueue.add('process-metafield', {
      token,
      action: 'update',
      data: values,
    });
    
    return {
      jobId: job.id,
      status: 'queued',
      message: 'Metafield update queued successfully',
    };
  }

  async queueBatchMetafields(token: string, operations: any[]) {
    if (!token) throw new UnauthorizedException();
    
    const job = await this.metafieldQueue.add('batch-metafield', {
      token,
      operations,
    });
    
    return {
      jobId: job.id,
      status: 'queued',
      message: `Batch operation with ${operations.length} items queued successfully`,
    };
  }

  async getJobStatus(jobId: string) {
    const job = await this.metafieldQueue.getJob(jobId);
    if (!job) {
      return { status: 'not_found' };
    }

    return {
      id: job.id,
      name: job.name,
      progress: job.progress,
      state: await job.getState(), 
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }
}
