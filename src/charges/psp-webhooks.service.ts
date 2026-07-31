import { Injectable } from '@nestjs/common';

import type { Charge } from '../domain/charge';
import type { PspWebhookDto, PspWebhookEvent } from './dto/psp-webhook.dto';
import { InMemoryChargeRepository } from './in-memory-charge.repository';

export class PaymentReferenceNotFoundError extends Error {
  constructor(reference: string) {
    super(`Payment reference ${reference} was not found.`);
    this.name = 'PaymentReferenceNotFoundError';
  }
}

export class PaymentAmountMismatchError extends Error {
  constructor(paidAmount: number, expectedAmount: number) {
    super(
      `Paid amount ${paidAmount} does not match expected amount ${expectedAmount}.`,
    );
    this.name = 'PaymentAmountMismatchError';
  }
}

export interface PspWebhookProcessingResult {
  readonly chargeId: string;
  readonly status: 'PAID';
  readonly event: PspWebhookEvent;
}

@Injectable()
export class PspWebhooksService {
  constructor(private readonly repository: InMemoryChargeRepository) {}

  process(input: PspWebhookDto): PspWebhookProcessingResult {
    const charge =
      input.event === 'boleto.paid'
        ? this.findBoleto(input.nossoNumero)
        : this.findPix(input.txid, input.endToEndId);

    if (input.paidAmount !== charge.amountInCents) {
      throw new PaymentAmountMismatchError(
        input.paidAmount,
        charge.amountInCents,
      );
    }

    // A entidade decide se o estado atual permite o pagamento; o service não
    // repete regras para cobranças pagas, canceladas ou expiradas.
    charge.markAsPaid();
    this.repository.save(charge);

    return {
      chargeId: charge.id,
      status: 'PAID',
      event: input.event,
    };
  }

  private findBoleto(nossoNumero: string | undefined): Charge {
    if (nossoNumero === undefined || nossoNumero.length === 0) {
      throw new Error('nossoNumero is required for boleto.paid.');
    }

    // A referência externa do boleto é o nossoNumero emitido pelo PSP.
    const charge = this.repository.findByNossoNumero(nossoNumero);

    if (charge === null) {
      throw new PaymentReferenceNotFoundError(nossoNumero);
    }

    return charge;
  }

  private findPix(
    txid: string | undefined,
    endToEndId: string | undefined,
  ): Charge {
    if (txid === undefined || txid.length === 0) {
      throw new Error('txid is required for pix.paid.');
    }

    if (endToEndId === undefined || endToEndId.length === 0) {
      throw new Error('endToEndId is required for pix.paid.');
    }

    // A referência externa usada para localizar o Pix é o txid emitido pelo PSP.
    const charge = this.repository.findByTxid(txid);

    if (charge === null) {
      throw new PaymentReferenceNotFoundError(txid);
    }

    return charge;
  }
}
