import { Injectable } from '@nestjs/common';

import type { IdempotentChargeRequest } from './idempotent-charge-request';

@Injectable()
export class InMemoryIdempotentChargeRequestRepository {
  private readonly requests = new Map<string, IdempotentChargeRequest>();

  save(request: IdempotentChargeRequest): void {
    this.requests.set(request.key, request);
  }

  findByKey(key: string): IdempotentChargeRequest | null {
    return this.requests.get(key) ?? null;
  }

  findAll(): IdempotentChargeRequest[] {
    return [...this.requests.values()];
  }

  count(): number {
    return this.requests.size;
  }

  clear(): void {
    this.requests.clear();
  }
}
