import type { Charge } from '../domain/charge';
import type { ChargeStatus } from '../domain/charge-status';

export interface ChargeListFilters {
  readonly status?: ChargeStatus;
  readonly payerDocument?: string;
  readonly page: number;
  readonly limit: number;
}

export interface PaginatedCharges {
  readonly items: Charge[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export class InMemoryChargeRepository {
  private readonly charges = new Map<string, Charge>();

  save(charge: Charge): void {
    this.charges.set(charge.id, charge);
  }

  findById(id: string): Charge | null {
    return this.charges.get(id) ?? null;
  }

  findAll(): Charge[] {
    return [...this.charges.values()];
  }

  findByNossoNumero(nossoNumero: string): Charge | null {
    for (const charge of this.charges.values()) {
      const paymentInstrument = charge.paymentInstrument;

      if (
        paymentInstrument.type === 'BOLETO' &&
        paymentInstrument.nossoNumero === nossoNumero
      ) {
        return charge;
      }
    }

    return null;
  }

  findByTxid(txid: string): Charge | null {
    for (const charge of this.charges.values()) {
      const paymentInstrument = charge.paymentInstrument;

      if (paymentInstrument.type === 'PIX' && paymentInstrument.txid === txid) {
        return charge;
      }
    }

    return null;
  }

  list(filters: ChargeListFilters): PaginatedCharges {
    const filteredCharges = [...this.charges.values()].filter((charge) => {
      const matchesStatus =
        filters.status === undefined || charge.status === filters.status;
      const matchesPayerDocument =
        filters.payerDocument === undefined ||
        charge.payer.document.value === filters.payerDocument;

      return matchesStatus && matchesPayerDocument;
    });

    const total = filteredCharges.length;

    // `total` considera todo o filtro; `items` contém somente a página solicitada.
    const startIndex = (filters.page - 1) * filters.limit;
    const items = filteredCharges.slice(startIndex, startIndex + filters.limit);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  count(): number {
    return this.charges.size;
  }

  clear(): void {
    this.charges.clear();
  }
}
