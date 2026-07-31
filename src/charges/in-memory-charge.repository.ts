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

/**
 * Armazena cobranças somente durante a execução do processo. O `Map` associa
 * diretamente cada identificador à sua entidade e substitui o valor quando a
 * mesma chave é salva novamente.
 */
export class InMemoryChargeRepository {
  private readonly charges = new Map<string, Charge>();

  save(charge: Charge): void {
    this.charges.set(charge.id, charge);
  }

  findById(id: string): Charge | null {
    return this.charges.get(id) ?? null;
  }

  findByNossoNumero(nossoNumero: string): Charge | null {
    for (const charge of this.charges.values()) {
      const paymentInstrument = charge.paymentInstrument;

      // O discriminador permite ao TypeScript reconhecer os campos exclusivos
      // do boleto sem cast e sem enfraquecer a verificação de tipos.
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

      // Depois da comparação, a união discriminada é estreitada para Pix e o
      // acesso a `txid` se torna seguro para o compilador.
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

    // `total` representa todas as correspondências antes do recorte da página,
    // enquanto `items` contém somente os elementos da página atual.
    const total = filteredCharges.length;

    // Como `page` começa em 1, subtrair um converte a página em deslocamento.
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
