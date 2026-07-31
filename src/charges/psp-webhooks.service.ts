import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import type { Charge } from '../domain/charge';
import { calculateBoletoPaymentAmount } from '../domain/boleto-payment-amount';
import { ChargeStateError } from '../domain/domain-error';
import { evaluatePixExpiration } from '../domain/pix-expiration';
import type { PspWebhookDto } from './dto/psp-webhook.dto';
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

export class InvalidPixExpirationEventError extends Error {
  constructor(expiredAt: string, lastPayableDate: string) {
    super(
      `Pix cannot expire at ${expiredAt}. It is payable through ${lastPayableDate}.`,
    );
    this.name = 'InvalidPixExpirationEventError';
  }
}

export type PspWebhookProcessingResult =
  | {
      readonly chargeId: string;
      readonly status: 'PAID';
      readonly event: 'boleto.paid' | 'pix.paid';
    }
  | {
      readonly chargeId: string;
      readonly status: 'EXPIRED' | 'PAID';
      readonly event: 'pix.expired';
    };

@Injectable()
export class PspWebhooksService {
  constructor(
    private readonly repository: InMemoryChargeRepository,
    private readonly divergenceRepository: InMemoryPaymentDivergenceRepository,
    private readonly processedWebhookRepository: InMemoryProcessedWebhookRepository,
  ) {}

  process(input: PspWebhookDto): PspWebhookProcessingResult {
    this.validateRequiredFields(input);

    if (input.event === 'pix.expired') {
      return this.processPixExpiration(input);
    }

    const webhookKey = this.createWebhookKey(input);
    const processed = this.processedWebhookRepository.findByKey(webhookKey);

    if (processed !== null) {
      // A repetição exata reapresenta o resultado original sem repetir efeitos.
      return this.replayProcessedWebhook(processed);
    }

    const charge =
      input.event === 'boleto.paid'
        ? this.findBoleto(input.nossoNumero)
        : this.findPix(input.txid);
    const paidAt = this.getPaidAt(input);
    const paidAmount = this.getPaidAmount(input);
    let canReconcileExpiredPix = false;

    if (input.event === 'pix.paid') {
      // `paidAt` representa o pagamento real, mesmo que o webhook chegue depois.
      const evaluation = evaluatePixExpiration(
        charge.dueDate,
        new Date(paidAt),
      );

      if (evaluation.isExpired) {
        if (charge.status === 'PENDING') {
          charge.expire();
          this.repository.save(charge);
        }

        throw new ChargeStateError('Pix expired before the payment occurred.');
      }

      canReconcileExpiredPix = charge.status === 'EXPIRED';
    }

    if (charge.status !== 'PENDING' && !canReconcileExpiredPix) {
      charge.markAsPaid();
    }

    const expectedAmount =
      input.event === 'boleto.paid'
        ? calculateBoletoPaymentAmount(
            charge.amountInCents,
            charge.dueDate,
            paidAt,
          ).expectedAmount
        : charge.amountInCents;

    if (paidAmount !== expectedAmount) {
      this.saveAmountMismatch(
        input,
        charge,
        webhookKey,
        paidAmount,
        paidAt,
        expectedAmount,
      );
      throw new PaymentAmountMismatchError(paidAmount, expectedAmount);
    }

    if (canReconcileExpiredPix) {
      // O evento atrasado pode reconciliar EXPIRED quando o pagamento ocorreu no prazo.
      charge.reconcileExpiredPixPayment(new Date(paidAt));
    } else {
      charge.markAsPaid();
    }

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

  private processPixExpiration(
    input: PspWebhookDto,
  ): PspWebhookProcessingResult {
    const txid = input.txid;
    const expiredAt = input.expiredAt;

    if (txid === undefined || expiredAt === undefined) {
      throw new Error('txid and expiredAt are required for pix.expired.');
    }

    const charge = this.repository.findByTxid(txid);

    if (charge === null) {
      throw new PaymentReferenceNotFoundError(txid);
    }

    const evaluation = evaluatePixExpiration(
      charge.dueDate,
      new Date(expiredAt),
    );

    if (!evaluation.isExpired) {
      throw new InvalidPixExpirationEventError(
        expiredAt,
        evaluation.lastPayableDate,
      );
    }

    if (charge.status === 'PAID') {
      // Uma expiração posterior nunca pode sobrescrever um pagamento confirmado.
      return { chargeId: charge.id, status: 'PAID', event: 'pix.expired' };
    }

    if (charge.status === 'EXPIRED') {
      return { chargeId: charge.id, status: 'EXPIRED', event: 'pix.expired' };
    }

    if (charge.status === 'CANCELLED') {
      throw new ChargeStateError('Cancelled Pix cannot expire.');
    }

    charge.expire();
    this.repository.save(charge);

    return { chargeId: charge.id, status: 'EXPIRED', event: 'pix.expired' };
  }

  private saveAmountMismatch(
    input: PspWebhookDto,
    charge: Charge,
    webhookKey: string,
    paidAmount: number,
    paidAt: string,
    expectedAmount: number,
  ): void {
    this.divergenceRepository.save({
      id: randomUUID(),
      chargeId: charge.id,
      event: input.event === 'boleto.paid' ? 'boleto.paid' : 'pix.paid',
      paymentReference: this.getPaymentReference(input),
      ...(input.endToEndId === undefined
        ? {}
        : { endToEndId: input.endToEndId }),
      paidAmount,
      expectedAmount,
      paidAt,
      reason: 'AMOUNT_MISMATCH',
      createdAt: new Date().toISOString(),
    });
    this.processedWebhookRepository.save({
      key: webhookKey,
      chargeId: charge.id,
      event: input.event === 'boleto.paid' ? 'boleto.paid' : 'pix.paid',
      outcome: { type: 'AMOUNT_MISMATCH', paidAmount, expectedAmount },
      processedAt: new Date().toISOString(),
    });
  }

  private validateRequiredFields(input: PspWebhookDto): void {
    if (input.event === 'boleto.paid') {
      if (input.nossoNumero === undefined || input.nossoNumero.length === 0) {
        throw new Error('nossoNumero is required for boleto.paid.');
      }

      this.validatePaymentFields(input);
      return;
    }

    if (input.txid === undefined || input.txid.length === 0) {
      throw new Error(`txid is required for ${input.event}.`);
    }

    if (input.event === 'pix.expired') {
      if (input.expiredAt === undefined || input.expiredAt.length === 0) {
        throw new Error('expiredAt is required for pix.expired.');
      }

      if (Number.isNaN(new Date(input.expiredAt).getTime())) {
        throw new Error('expiredAt must be a valid date and time.');
      }

      return;
    }

    if (input.endToEndId === undefined || input.endToEndId.length === 0) {
      throw new Error('endToEndId is required for pix.paid.');
    }

    this.validatePaymentFields(input);
  }

  private validatePaymentFields(input: PspWebhookDto): void {
    if (
      input.paidAmount === undefined ||
      !Number.isInteger(input.paidAmount) ||
      input.paidAmount < 1
    ) {
      throw new Error('paidAmount must be a positive integer.');
    }

    if (
      input.paidAt === undefined ||
      Number.isNaN(new Date(input.paidAt).getTime())
    ) {
      throw new Error('paidAt must be a valid date and time.');
    }
  }

  private createWebhookKey(input: PspWebhookDto): string {
    const paidAt = new Date(this.getPaidAt(input));
    const paidAmount = this.getPaidAmount(input);
    const components =
      input.event === 'boleto.paid'
        ? [input.event, input.nossoNumero, paidAmount, paidAt.toISOString()]
        : [
            input.event,
            input.txid,
            paidAmount,
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

    const charge = this.repository.findByNossoNumero(nossoNumero);

    if (charge === null) {
      throw new PaymentReferenceNotFoundError(nossoNumero);
    }

    return charge;
  }

  private findPix(txid: string | undefined): Charge {
    if (txid === undefined || txid.length === 0) {
      throw new Error('txid is required for Pix events.');
    }

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

  private getPaidAt(input: PspWebhookDto): string {
    if (input.paidAt === undefined) {
      throw new Error('paidAt is required for payment events.');
    }

    return input.paidAt;
  }

  private getPaidAmount(input: PspWebhookDto): number {
    if (input.paidAmount === undefined) {
      throw new Error('paidAmount is required for payment events.');
    }

    return input.paidAmount;
  }
}
