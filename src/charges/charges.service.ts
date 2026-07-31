import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { Charge } from '../domain/charge';
import { validateChargeAmount } from '../domain/charge-amount';
import { validateDueDate } from '../domain/charge-date';
import { ChargeValidationError } from '../domain/domain-error';
import type { Payer } from '../domain/payer';
import { PayerDocument } from '../domain/payer-document';
import type { PaymentInstrument } from '../domain/payment-instrument';
import { evaluatePixExpiration } from '../domain/pix-expiration';
import type { CreateChargeDto } from './dto/create-charge.dto';
import type { ListChargesQueryDto } from './dto/list-charges-query.dto';
import { FakePaymentProvider } from './fake-payment-provider';
import {
  InMemoryChargeRepository,
  type PaginatedCharges,
} from './in-memory-charge.repository';
import { InMemoryIdempotentChargeRequestRepository } from './in-memory-idempotent-charge-request.repository';

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class ChargeNotFoundError extends Error {
  constructor(id: string) {
    super(`Charge ${id} was not found.`);
    this.name = 'ChargeNotFoundError';
  }
}

export class InvalidIdempotencyKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIdempotencyKeyError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key ${key} was already used with a different request.`);
    this.name = 'IdempotencyConflictError';
  }
}

@Injectable()
export class ChargesService {
  constructor(
    private readonly repository: InMemoryChargeRepository,
    private readonly paymentProvider: FakePaymentProvider,
    private readonly idempotencyRepository: InMemoryIdempotentChargeRequestRepository,
  ) {}

  async create(
    input: CreateChargeDto,
    idempotencyKey?: string,
  ): Promise<Charge> {
    const payerDocument = new PayerDocument(input.payer.document);
    const payer: Payer = {
      name: input.payer.name,
      document: payerDocument,
      email: input.payer.email,
    };

    validateChargeAmount(input.amount, input.paymentMethod);
    validateDueDate(input.dueDate, new Date());

    const description = input.description.trim();

    if (description.length === 0) {
      throw new ChargeValidationError('Charge description cannot be empty.');
    }

    const normalizedKey = this.normalizeIdempotencyKey(idempotencyKey);
    const requestHash =
      normalizedKey === undefined
        ? undefined
        : this.createRequestHash(input, payerDocument.value, description);

    if (normalizedKey !== undefined && requestHash !== undefined) {
      const existing = this.idempotencyRepository.findByKey(normalizedKey);

      if (existing !== null) {
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyConflictError(normalizedKey);
        }

        // Uma repetição válida reutiliza a cobrança sem chamar novamente o PSP.
        const existingCharge = this.repository.findById(existing.chargeId);

        if (existingCharge === null) {
          throw new Error('Idempotency record points to a missing charge.');
        }

        return existingCharge;
      }
    }

    let paymentInstrument: PaymentInstrument;

    try {
      paymentInstrument = await this.paymentProvider.issue(input.paymentMethod);
    } catch {
      throw new PaymentProviderError('Could not issue the payment instrument.');
    }

    const charge = new Charge({
      id: randomUUID(),
      paymentInstrument,
      amountInCents: input.amount,
      payer,
      dueDate: input.dueDate,
      description,
    });

    this.repository.save(charge);

    if (normalizedKey !== undefined && requestHash !== undefined) {
      // A chave só é salva após a cobrança, evitando apontar para uma criação que falhou.
      this.idempotencyRepository.save({
        key: normalizedKey,
        requestHash,
        chargeId: charge.id,
        createdAt: new Date().toISOString(),
      });
    }

    return charge;
  }

  findById(id: string): Charge {
    const charge = this.repository.findById(id);

    if (charge === null) {
      throw new ChargeNotFoundError(id);
    }

    this.refreshPixExpiration(charge, new Date());

    return charge;
  }

  cancel(id: string): Charge {
    const charge = this.findById(id);

    charge.cancel();
    this.repository.save(charge);

    return charge;
  }

  list(query: ListChargesQueryDto): PaginatedCharges {
    const payerDocument =
      query.payerDocument === undefined
        ? undefined
        : new PayerDocument(query.payerDocument).value;
    const referenceAt = new Date();

    for (const charge of this.repository.findAll()) {
      this.refreshPixExpiration(charge, referenceAt);
    }

    return this.repository.list({
      status: query.status,
      payerDocument,
      page: query.page,
      limit: query.limit,
    });
  }

  private refreshPixExpiration(charge: Charge, referenceAt: Date): void {
    // Em memória, a atualização preguiçosa substitui um scheduler.
    if (charge.paymentMethod !== 'PIX' || charge.status !== 'PENDING') {
      return;
    }

    const evaluation = evaluatePixExpiration(charge.dueDate, referenceAt);

    if (!evaluation.isExpired) {
      return;
    }

    charge.expire();
    this.repository.save(charge);
  }

  private normalizeIdempotencyKey(key: string | undefined): string | undefined {
    if (key === undefined) {
      return undefined;
    }

    const normalizedKey = key.trim();

    if (normalizedKey.length === 0) {
      throw new InvalidIdempotencyKeyError('Idempotency key cannot be empty.');
    }

    if (normalizedKey.length > 255) {
      throw new InvalidIdempotencyKeyError(
        'Idempotency key cannot exceed 255 characters.',
      );
    }

    return normalizedKey;
  }

  private createRequestHash(
    input: CreateChargeDto,
    normalizedDocument: string,
    description: string,
  ): string {
    // Ordem fixa e documento normalizado tornam o hash independente do formato do JSON.
    const canonicalRequest = JSON.stringify([
      input.payer.name,
      normalizedDocument,
      input.payer.email,
      input.amount,
      input.dueDate,
      description,
      input.paymentMethod,
    ]);

    return createHash('sha256').update(canonicalRequest).digest('hex');
  }
}
