import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import type { Charge } from '../domain/charge';
import { calculateBoletoPaymentAmount } from '../domain/boleto-payment-amount';
import { ChargeStateError } from '../domain/domain-error';
import { evaluatePixExpiration } from '../domain/pix-expiration';
import type { PspWebhookDto, PspWebhookEvent } from './dto/psp-webhook.dto';
import { InMemoryChargeRepository } from './in-memory-charge.repository';
import { InMemoryPaymentDivergenceRepository } from './in-memory-payment-divergence.repository';
import { InMemoryProcessedWebhookRepository } from './in-memory-processed-webhook.repository';
import type { ProcessedWebhook } from './processed-webhook';

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
  constructor(
    private readonly repository: InMemoryChargeRepository,
    private readonly divergenceRepository: InMemoryPaymentDivergenceRepository,
    private readonly processedWebhookRepository: InMemoryProcessedWebhookRepository,
  ) {}

  process(input: PspWebhookDto): PspWebhookProcessingResult {
    this.validateRequiredFields(input);
    const webhookKey = this.createWebhookKey(input);
    const processed = this.processedWebhookRepository.findByKey(webhookKey);

    if (processed !== null) {
      // Uma repetição reapresenta o resultado original sem localizar a cobrança
      // ou executar novamente alterações de estado e persistências.
      return this.replayProcessedWebhook(processed);
    }

    const charge =
      input.event === 'boleto.paid'
        ? this.findBoleto(input.nossoNumero)
        : this.findPix(input.txid, input.endToEndId);

    if (input.event === 'pix.paid') {
      // O instante informado pelo PSP determina se o pagamento ocorreu dentro
      // da tolerância, mesmo quando a entrega do webhook acontecer mais tarde.
      const evaluation = evaluatePixExpiration(
        charge.dueDate,
        new Date(input.paidAt),
      );

      if (charge.status === 'PENDING' && evaluation.isExpired) {
        charge.expire();
        this.repository.save(charge);
        throw new ChargeStateError('Pix expired before the payment occurred.');
      }
    }

    if (charge.status !== 'PENDING') {
      // A própria entidade produz o erro de estado antes que uma diferença de
      // valor seja interpretada incorretamente como divergência financeira.
      charge.markAsPaid();
    }

    const expectedAmount =
      input.event === 'boleto.paid'
        ? calculateBoletoPaymentAmount(
            charge.amountInCents,
            charge.dueDate,
            input.paidAt,
          ).expectedAmount
        : charge.amountInCents;

    if (input.paidAmount !== expectedAmount) {
      // O registro precisa existir mesmo que o fluxo termine com HTTP 422, pois
      // ele representa justamente a tentativa que não pôde quitar a cobrança.
      this.divergenceRepository.save({
        id: randomUUID(),
        chargeId: charge.id,
        event: input.event,
        paymentReference: this.getPaymentReference(input),
        ...(input.endToEndId === undefined
          ? {}
          : { endToEndId: input.endToEndId }),
        paidAmount: input.paidAmount,
        expectedAmount,
        paidAt: input.paidAt,
        reason: 'AMOUNT_MISMATCH',
        createdAt: new Date().toISOString(),
      });
      // Salvar a chave junto da primeira divergência impede que a mesma
      // notificação repetida crie outro registro financeiro.
      this.processedWebhookRepository.save({
        key: webhookKey,
        chargeId: charge.id,
        event: input.event,
        outcome: {
          type: 'AMOUNT_MISMATCH',
          paidAmount: input.paidAmount,
          expectedAmount,
        },
        processedAt: new Date().toISOString(),
      });
      throw new PaymentAmountMismatchError(input.paidAmount, expectedAmount);
    }

    // A entidade decide se o estado atual permite o pagamento; o service não
    // repete regras para cobranças pagas, canceladas ou expiradas.
    charge.markAsPaid();
    this.repository.save(charge);

    const result: PspWebhookProcessingResult = {
      chargeId: charge.id,
      status: 'PAID',
      event: input.event,
    };
    this.processedWebhookRepository.save({
      key: webhookKey,
      chargeId: charge.id,
      event: input.event,
      outcome: { type: 'PAID', result },
      processedAt: new Date().toISOString(),
    });

    return result;
  }

  private validateRequiredFields(input: PspWebhookDto): void {
    if (input.event === 'boleto.paid') {
      if (input.nossoNumero === undefined || input.nossoNumero.length === 0) {
        throw new Error('nossoNumero is required for boleto.paid.');
      }

      return;
    }

    if (input.txid === undefined || input.txid.length === 0) {
      throw new Error('txid is required for pix.paid.');
    }

    if (input.endToEndId === undefined || input.endToEndId.length === 0) {
      throw new Error('endToEndId is required for pix.paid.');
    }
  }

  private createWebhookKey(input: PspWebhookDto): string {
    const paidAt = new Date(input.paidAt);

    if (Number.isNaN(paidAt.getTime())) {
      throw new Error('paidAt must be a valid date and time.');
    }

    // Componentes em ordem fixa tornam a chave determinística. Normalizar
    // `paidAt` faz offsets diferentes do mesmo instante produzirem a mesma chave.
    const components =
      input.event === 'boleto.paid'
        ? [
            input.event,
            input.nossoNumero,
            input.paidAmount,
            paidAt.toISOString(),
          ]
        : [
            input.event,
            input.txid,
            input.paidAmount,
            paidAt.toISOString(),
            input.endToEndId,
          ];

    return createHash('sha256').update(components.join('|')).digest('hex');
  }

  private replayProcessedWebhook(
    processed: ProcessedWebhook,
  ): PspWebhookProcessingResult {
    if (processed.outcome.type === 'PAID') {
      return processed.outcome.result;
    }

    throw new PaymentAmountMismatchError(
      processed.outcome.paidAmount,
      processed.outcome.expectedAmount,
    );
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

  private getPaymentReference(input: PspWebhookDto): string {
    const reference =
      input.event === 'boleto.paid' ? input.nossoNumero : input.txid;

    if (reference === undefined || reference.length === 0) {
      throw new Error('Payment reference is required.');
    }

    return reference;
  }
}
