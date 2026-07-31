import { Charge } from '../domain/charge';
import { ChargeStateError } from '../domain/domain-error';
import type { Payer } from '../domain/payer';
import { PayerDocument } from '../domain/payer-document';
import type { PaymentInstrument } from '../domain/payment-instrument';
import type { PspWebhookDto } from './dto/psp-webhook.dto';
import { InMemoryChargeRepository } from './in-memory-charge.repository';
import { InMemoryPaymentDivergenceRepository } from './in-memory-payment-divergence.repository';
import { InMemoryProcessedWebhookRepository } from './in-memory-processed-webhook.repository';
import {
  PaymentAmountMismatchError,
  PaymentReferenceNotFoundError,
  PspWebhooksService,
} from './psp-webhooks.service';

function createPayer(): Payer {
  return {
    name: 'Maria Souza',
    document: new PayerDocument('529.982.247-25'),
    email: 'maria@example.com',
  };
}

function createBoletoInstrument(): PaymentInstrument {
  return {
    type: 'BOLETO',
    nossoNumero: 'boleto-123456',
    digitableLine: '12345678901234567890123456789012345678901234567',
    barcode: '12345678901234567890123456789012345678901234',
  };
}

function createPixInstrument(): PaymentInstrument {
  return {
    type: 'PIX',
    txid: 'pix-123456',
    brCode: '00020101021226850014br.gov.bcb.pix',
    qrCode: 'data:image/png;base64,fake-pix',
  };
}

function createCharge(
  id: string,
  instrument: PaymentInstrument,
  dueDate = '2026-08-15',
): Charge {
  return new Charge({
    id,
    paymentInstrument: instrument,
    amountInCents: 45_050,
    payer: createPayer(),
    dueDate,
    description: 'Cobrança de teste',
  });
}

function createBoletoInput(): PspWebhookDto {
  return {
    event: 'boleto.paid',
    nossoNumero: 'boleto-123456',
    paidAmount: 45_050,
    paidAt: '2026-08-14T14:32:00-03:00',
  };
}

function createPixInput(): PspWebhookDto {
  return {
    event: 'pix.paid',
    txid: 'pix-123456',
    paidAmount: 45_050,
    paidAt: '2026-08-14T09:10:00-03:00',
    endToEndId: 'E12345678901234567890',
  };
}

describe('PspWebhooksService', () => {
  let repository: InMemoryChargeRepository;
  let divergenceRepository: InMemoryPaymentDivergenceRepository;
  let processedWebhookRepository: InMemoryProcessedWebhookRepository;
  let service: PspWebhooksService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T12:00:00-03:00'));
    repository = new InMemoryChargeRepository();
    divergenceRepository = new InMemoryPaymentDivergenceRepository();
    processedWebhookRepository = new InMemoryProcessedWebhookRepository();
    service = new PspWebhooksService(
      repository,
      divergenceRepository,
      processedWebhookRepository,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('processes a boleto using nossoNumero', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);

    const result = service.process(createBoletoInput());

    expect(result.chargeId).toBe(charge.id);
  });

  it('accepts the original boleto amount before the due date', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);

    expect(() => service.process(createBoletoInput())).not.toThrow();
  });

  it('accepts the original boleto amount on the due date', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAt = '2026-08-15T23:59:59-03:00';

    expect(() => service.process(input)).not.toThrow();
  });

  it('rejects the original boleto amount one day after the due date', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAt = '2026-08-16T12:00:00-03:00';

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);
  });

  it('accepts a late boleto with the calculated fine and interest', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAt = '2026-08-16T12:00:00-03:00';
    input.paidAmount = 45_966;

    expect(() => service.process(input)).not.toThrow();
    expect(charge.status).toBe('PAID');
  });

  it('uses the calculated amount for several late days', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAt = '2026-08-25T12:00:00-03:00';
    input.paidAmount = 46_101;

    expect(() => service.process(input)).not.toThrow();
  });

  it('keeps a late boleto pending when its amount is incorrect', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAt = '2026-08-16T12:00:00-03:00';

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);
    expect(charge.status).toBe('PENDING');
  });

  it('processes Pix using txid', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);

    const result = service.process(createPixInput());

    expect(result.chargeId).toBe(charge.id);
  });

  it('marks a boleto as paid', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);

    service.process(createBoletoInput());

    expect(charge.status).toBe('PAID');
  });

  it('marks Pix as paid', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);

    service.process(createPixInput());

    expect(charge.status).toBe('PAID');
  });

  it('keeps Pix at the original amount during its tolerance period', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-18T23:59:59-03:00';

    expect(() => service.process(input)).not.toThrow();
    expect(charge.status).toBe('PAID');
  });

  it('does not apply the boleto late amount to Pix', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-16T12:00:00-03:00';
    input.paidAmount = 45_966;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);
    expect(charge.status).toBe('PENDING');
  });

  it.each([
    ['due date', '2026-08-15T23:59:59-03:00'],
    ['first tolerance day', '2026-08-16T12:00:00-03:00'],
    ['third tolerance day', '2026-08-18T23:59:59-03:00'],
  ])('accepts Pix on the %s', (_name, paidAt) => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = paidAt;

    expect(() => service.process(input)).not.toThrow();
    expect(charge.status).toBe('PAID');
  });

  it('rejects Pix paid on the fourth day after due date', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-19T00:00:00-03:00';

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(charge.status).toBe('EXPIRED');
  });

  it('saves an expired Pix before rejecting its payment', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const saveSpy = jest.spyOn(repository, 'save');
    saveSpy.mockClear();
    const input = createPixInput();
    input.paidAt = '2026-08-19T12:00:00-03:00';

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(saveSpy).toHaveBeenCalledWith(charge);
    expect(repository.findById(charge.id)?.status).toBe('EXPIRED');
  });

  it('does not mark an expired Pix as paid', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-19T12:00:00-03:00';

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(charge.status).not.toBe('PAID');
  });

  it('uses paidAt instead of the current server date for Pix expiration', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    jest.setSystemTime(new Date('2026-09-01T12:00:00-03:00'));
    const input = createPixInput();
    input.paidAt = '2026-08-18T23:59:59-03:00';

    expect(() => service.process(input)).not.toThrow();
    expect(charge.status).toBe('PAID');
  });

  it('does not transform an already paid Pix into expired', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    charge.markAsPaid();
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-19T12:00:00-03:00';

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(charge.status).toBe('PAID');
  });

  it('keeps rejecting payment for a cancelled Pix', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    charge.cancel();
    repository.save(charge);

    expect(() => service.process(createPixInput())).toThrow(ChargeStateError);
    expect(charge.status).toBe('CANCELLED');
  });

  it('saves the updated charge', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const saveSpy = jest.spyOn(repository, 'save');

    service.process(createBoletoInput());

    expect(saveSpy).toHaveBeenCalledWith(charge);
  });

  it('returns the correct charge ID', () => {
    const charge = createCharge('expected-id', createBoletoInstrument());
    repository.save(charge);

    const result = service.process(createBoletoInput());

    expect(result.chargeId).toBe('expected-id');
  });

  it('returns the processed event', () => {
    repository.save(createCharge('charge-pix', createPixInstrument()));

    const result = service.process(createPixInput());

    expect(result.event).toBe('pix.paid');
  });

  it('throws when nossoNumero is not found', () => {
    expect(() => service.process(createBoletoInput())).toThrow(
      PaymentReferenceNotFoundError,
    );
  });

  it('throws when txid is not found', () => {
    expect(() => service.process(createPixInput())).toThrow(
      PaymentReferenceNotFoundError,
    );
  });

  it('throws when paidAmount differs from the original amount', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));
    const input = createBoletoInput();
    input.paidAmount = 45_049;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);
  });

  it('keeps the charge pending when paidAmount differs', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAmount = 45_049;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);
    expect(charge.status).toBe('PENDING');
  });

  it('registers a divergence for a partial boleto payment', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));
    const input = createBoletoInput();
    input.paidAmount = 20_000;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);

    expect(divergenceRepository.count()).toBe(1);
    expect(divergenceRepository.findAll()[0]).toMatchObject({
      chargeId: 'charge-boleto',
      event: 'boleto.paid',
      paymentReference: 'boleto-123456',
      paidAmount: 20_000,
      expectedAmount: 45_050,
      paidAt: input.paidAt,
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('registers a divergence for a boleto amount above expected', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));
    const input = createBoletoInput();
    input.paidAmount = 50_000;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);

    expect(divergenceRepository.findAll()[0]?.paidAmount).toBe(50_000);
  });

  it('stores the late boleto amount including fine and interest as expected', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));
    const input = createBoletoInput();
    input.paidAt = '2026-08-16T12:00:00-03:00';

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);

    expect(divergenceRepository.findAll()[0]?.expectedAmount).toBe(45_966);
  });

  it.each([
    ['below', 45_049],
    ['above', 45_051],
  ])('registers a Pix amount %s expected', (_name, paidAmount) => {
    repository.save(createCharge('charge-pix', createPixInstrument()));
    const input = createPixInput();
    input.paidAmount = paidAmount;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);

    expect(divergenceRepository.findAll()[0]).toMatchObject({
      chargeId: 'charge-pix',
      event: 'pix.paid',
      paymentReference: 'pix-123456',
      endToEndId: 'E12345678901234567890',
      paidAmount,
      expectedAmount: 45_050,
      paidAt: input.paidAt,
      reason: 'AMOUNT_MISMATCH',
    });
  });

  it('stores createdAt as the current ISO timestamp', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));
    const input = createBoletoInput();
    input.paidAmount = 45_049;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);

    const createdAt = divergenceRepository.findAll()[0]?.createdAt;
    expect(createdAt).toBe('2026-08-10T15:00:00.000Z');
    expect(new Date(createdAt ?? '').toISOString()).toBe(createdAt);
  });

  it('does not register divergence for a valid payment', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));

    service.process(createBoletoInput());

    expect(divergenceRepository.count()).toBe(0);
  });

  it('does not register divergence for an unknown reference', () => {
    expect(() => service.process(createBoletoInput())).toThrow(
      PaymentReferenceNotFoundError,
    );

    expect(divergenceRepository.count()).toBe(0);
  });

  it('does not register divergence for a cancelled charge', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    charge.cancel();
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAmount = 1;

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(divergenceRepository.count()).toBe(0);
  });

  it('does not register divergence for a paid charge', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    charge.markAsPaid();
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAmount = 1;

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(divergenceRepository.count()).toBe(0);
  });

  it('does not register monetary divergence for an expired Pix', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-19T12:00:00-03:00';
    input.paidAmount = 1;

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(charge.status).toBe('EXPIRED');
    expect(divergenceRepository.count()).toBe(0);
  });

  it('replays the same successful boleto result without paying again', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const markAsPaidSpy = jest.spyOn(charge, 'markAsPaid');
    const input = createBoletoInput();

    const firstResult = service.process(input);
    const repeatedResult = service.process(input);

    expect(repeatedResult).toBe(firstResult);
    expect(repeatedResult.status).toBe('PAID');
    expect(markAsPaidSpy).toHaveBeenCalledTimes(1);
    expect(charge.status).toBe('PAID');
    expect(processedWebhookRepository.count()).toBe(1);
  });

  it('replays the same successful Pix result only once', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();

    const firstResult = service.process(input);
    const repeatedResult = service.process(input);

    expect(repeatedResult).toBe(firstResult);
    expect(charge.status).toBe('PAID');
    expect(processedWebhookRepository.count()).toBe(1);
  });

  it('stores an amount mismatch outcome and replays its error', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const input = createBoletoInput();
    input.paidAmount = 20_000;

    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);
    expect(() => service.process(input)).toThrow(PaymentAmountMismatchError);

    expect(processedWebhookRepository.findAll()[0]).toMatchObject({
      chargeId: charge.id,
      event: 'boleto.paid',
      outcome: {
        type: 'AMOUNT_MISMATCH',
        paidAmount: 20_000,
        expectedAmount: 45_050,
      },
    });
    expect(processedWebhookRepository.count()).toBe(1);
    expect(divergenceRepository.count()).toBe(1);
    expect(charge.status).toBe('PENDING');
  });

  it('rejects a different notification for an already paid charge', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    service.process(createBoletoInput());
    const differentInput = createBoletoInput();
    differentInput.paidAmount = 45_051;

    expect(() => service.process(differentInput)).toThrow(ChargeStateError);
    expect(processedWebhookRepository.count()).toBe(1);
  });

  it('does not store a processed webhook for an unknown reference', () => {
    expect(() => service.process(createBoletoInput())).toThrow(
      PaymentReferenceNotFoundError,
    );

    expect(processedWebhookRepository.count()).toBe(0);
  });

  it('does not store a processed webhook for a cancelled charge', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    charge.cancel();
    repository.save(charge);

    expect(() => service.process(createBoletoInput())).toThrow(
      ChargeStateError,
    );
    expect(processedWebhookRepository.count()).toBe(0);
  });

  it('does not store a processed webhook for an expired Pix', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-19T12:00:00-03:00';

    expect(() => service.process(input)).toThrow(ChargeStateError);
    expect(processedWebhookRepository.count()).toBe(0);
  });

  it('stores processedAt as a valid current ISO timestamp', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));

    service.process(createBoletoInput());

    const processedAt = processedWebhookRepository.findAll()[0]?.processedAt;
    expect(processedAt).toBe('2026-08-10T15:00:00.000Z');
    expect(new Date(processedAt ?? '').toISOString()).toBe(processedAt);
  });

  it('treats equivalent paidAt offsets as the same notification', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    repository.save(charge);
    const firstInput = createBoletoInput();
    const equivalentInput = createBoletoInput();
    equivalentInput.paidAt = '2026-08-14T17:32:00.000Z';

    const firstResult = service.process(firstInput);
    const repeatedResult = service.process(equivalentInput);

    expect(repeatedResult).toBe(firstResult);
    expect(processedWebhookRepository.count()).toBe(1);
  });

  it('generates different keys for boleto and Pix notifications', () => {
    const boleto = createCharge('charge-boleto', createBoletoInstrument());
    const pix = createCharge('charge-pix', createPixInstrument());
    repository.save(boleto);
    repository.save(pix);

    service.process(createBoletoInput());
    service.process(createPixInput());

    const [first, second] = processedWebhookRepository.findAll();
    expect(first?.key).not.toBe(second?.key);
    expect(processedWebhookRepository.count()).toBe(2);
  });

  it('generates different keys for genuinely different payloads', () => {
    repository.save(createCharge('charge-boleto', createBoletoInstrument()));
    const firstInput = createBoletoInput();
    firstInput.paidAmount = 1;
    const secondInput = createBoletoInput();
    secondInput.paidAmount = 2;

    expect(() => service.process(firstInput)).toThrow(
      PaymentAmountMismatchError,
    );
    expect(() => service.process(secondInput)).toThrow(
      PaymentAmountMismatchError,
    );

    expect(processedWebhookRepository.count()).toBe(2);
    expect(divergenceRepository.count()).toBe(2);
  });

  it('does not pay a cancelled charge', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    charge.cancel();
    repository.save(charge);

    expect(() => service.process(createBoletoInput())).toThrow(
      ChargeStateError,
    );
  });

  it('does not pay an already paid charge', () => {
    const charge = createCharge('charge-boleto', createBoletoInstrument());
    charge.markAsPaid();
    repository.save(charge);

    expect(() => service.process(createBoletoInput())).toThrow(
      ChargeStateError,
    );
  });

  it('rejects a direct boleto call without nossoNumero', () => {
    const input = createBoletoInput();
    delete input.nossoNumero;

    expect(() => service.process(input)).toThrow(
      'nossoNumero is required for boleto.paid.',
    );
  });

  it('rejects a direct Pix call without txid', () => {
    const input = createPixInput();
    delete input.txid;

    expect(() => service.process(input)).toThrow(
      'txid is required for pix.paid.',
    );
  });

  it('rejects a direct Pix call without endToEndId', () => {
    const input = createPixInput();
    delete input.endToEndId;

    expect(() => service.process(input)).toThrow(
      'endToEndId is required for pix.paid.',
    );
  });
});
