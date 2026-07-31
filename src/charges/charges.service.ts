import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

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

/** Representa uma falha técnica ao conversar com o provedor de pagamentos. */
export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

/** Representa a tentativa de acessar uma cobrança que não está no repositório. */
export class ChargeNotFoundError extends Error {
  constructor(id: string) {
    super(`Charge ${id} was not found.`);
    this.name = 'ChargeNotFoundError';
  }
}

/**
 * Coordena a criação da cobrança: valida os dados, solicita o instrumento ao PSP,
 * cria a entidade e persiste o resultado. As regras continuam implementadas no
 * domínio; o service apenas organiza a ordem dessas operações.
 */
@Injectable()
export class ChargesService {
  constructor(
    private readonly repository: InMemoryChargeRepository,
    private readonly paymentProvider: FakePaymentProvider,
  ) {}

  async create(input: CreateChargeDto): Promise<Charge> {
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

    let paymentInstrument: PaymentInstrument;

    try {
      paymentInstrument = await this.paymentProvider.issue(input.paymentMethod);
    } catch {
      // Uma falha do PSP é técnica e acontece antes da persistência. Ela recebe
      // um erro próprio para que a camada HTTP possa responder adequadamente.
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

    // O service delega a transição à entidade para não duplicar regras sobre
    // quais estados podem ou não ser cancelados.
    charge.cancel();
    this.repository.save(charge);

    return charge;
  }

  list(query: ListChargesQueryDto): PaginatedCharges {
    // A normalização acontece no service para que o repositório compare apenas
    // a representação numérica já validada por `PayerDocument`.
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
    if (charge.paymentMethod !== 'PIX' || charge.status !== 'PENDING') {
      return;
    }

    const evaluation = evaluatePixExpiration(charge.dueDate, referenceAt);

    if (!evaluation.isExpired) {
      return;
    }

    // Nesta implementação in-memory, a atualização preguiçosa substitui um
    // scheduler e persiste a expiração quando a cobrança volta a ser acessada.
    charge.expire();
    this.repository.save(charge);
  }
}
