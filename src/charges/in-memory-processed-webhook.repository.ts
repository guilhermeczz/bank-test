import { Injectable } from '@nestjs/common';

import type { ProcessedWebhook } from './processed-webhook';

@Injectable()
export class InMemoryProcessedWebhookRepository {
  private readonly webhooks = new Map<string, ProcessedWebhook>();

  save(webhook: ProcessedWebhook): void {
    this.webhooks.set(webhook.key, webhook);
  }

  findByKey(key: string): ProcessedWebhook | null {
    return this.webhooks.get(key) ?? null;
  }

  findAll(): ProcessedWebhook[] {
    return [...this.webhooks.values()];
  }

  count(): number {
    return this.webhooks.size;
  }

  clear(): void {
    this.webhooks.clear();
  }
}
