import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { HaravanAPIService } from '../haravan/haravan.api';

interface MetafieldJobData {
  token: string;
  action: 'create' | 'update' | 'delete';
  data: any;
}

interface BatchMetafieldJobData {
  token: string;
  operations: MetafieldJobData[];
}

@Processor('metafield')
export class MetafieldProcessor extends WorkerHost {
  private readonly logger = new Logger(MetafieldProcessor.name);

  constructor(
    private readonly haravanApi: HaravanAPIService,
  ) {
    super();
  }

  async process(job: Job<MetafieldJobData | BatchMetafieldJobData>): Promise<any> {
    // Check if this is a batch job
    if ('operations' in job.data) {
      return this.handleBatchMetafield(job as Job<BatchMetafieldJobData>);
    }
    
    // Otherwise it's a single metafield job
    return this.handleMetafieldJob(job as Job<MetafieldJobData>);
  }

  private async handleMetafieldJob(job: Job<MetafieldJobData>) {
    const { token, action, data } = job.data;
    
    this.logger.log(`Processing ${action} metafield job ${job.id}`);

    try {
      let result;

      switch (action) {
        case 'create':
          result = await this.haravanApi.createMetafields(token, data);
          break;

        case 'update':
          result = await this.haravanApi.updateMetafields(token, data);
          break;

        case 'delete':
          result = await this.haravanApi.deleteMetafields(token, data.metafieldid);
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      await job.updateProgress(100);
      this.logger.log(`Completed ${action} metafield job ${job.id}`);
      
      return {
        success: true,
        action,
        result,
        completedAt: new Date(),
      };

    } catch (error) {
      this.logger.error(`Failed ${action} metafield job ${job.id}`, error.stack);
      throw error; // BullMQ sẽ tự động retry
    }
  }

  private async handleBatchMetafield(job: Job<BatchMetafieldJobData>) {
    const { token, operations } = job.data;
    
    this.logger.log(`Processing batch metafield job ${job.id} with ${operations.length} operations`);

    try {
      const results = [];
      const total = operations.length;

      for (let i = 0; i < total; i++) {
        const operation = operations[i];
        
        // Update progress
        await job.updateProgress((i / total) * 100);

        this.logger.log(`Processing operation ${i + 1}/${total}: ${operation.action}`);

        let result;
        switch (operation.action) {
          case 'create':
            result = await this.haravanApi.createMetafields(token, operation.data);
            break;

          case 'update':
            result = await this.haravanApi.updateMetafields(token, operation.data);
            break;

          case 'delete':
            result = await this.haravanApi.deleteMetafields(token, operation.data.metafieldid);
            break;
        }

        results.push({
          operation: operation.action,
          success: true,
          result,
        });

        // Rate limiting: đợi 500ms giữa các request
        if (i < total - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      await job.updateProgress(100);
      this.logger.log(`Completed batch metafield job ${job.id}`);

      return {
        success: true,
        totalProcessed: results.length,
        results,
        completedAt: new Date(),
      };

    } catch (error) {
      this.logger.error(`Failed batch metafield job ${job.id}`, error.stack);
      throw error;
    }
  }
}

