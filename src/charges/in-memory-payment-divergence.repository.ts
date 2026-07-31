import { Injectable } from '@nestjs/common';

import type { PaymentDivergence } from './payment-divergence';

@Injectable()
export class InMemoryPaymentDivergenceRepository {
  private readonly divergences = new Map<string, PaymentDivergence>();

  save(divergence: PaymentDivergence): void {
    this.divergences.set(divergence.id, divergence);
  }

  findById(id: string): PaymentDivergence | null {
    return this.divergences.get(id) ?? null;
  }

  findByChargeId(chargeId: string): PaymentDivergence[] {
    return [...this.divergences.values()].filter(
      (divergence) => divergence.chargeId === chargeId,
    );
  }

  findAll(): PaymentDivergence[] {
    return [...this.divergences.values()];
  }

  count(): number {
    return this.divergences.size;
  }

  clear(): void {
    this.divergences.clear();
  }
}
