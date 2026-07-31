import { Charge } from '../domain/charge';
import { ChargeStateError } from '../domain/domain-error';
import type { Payer } from '../domain/payer';
import { PayerDocument } from '../domain/payer-document';
import type { PaymentInstrument } from '../domain/payment-instrument';
import type { PspWebhookDto } from './dto/psp-webhook.dto';
import { InMemoryChargeRepository } from './in-memory-charge.repository';
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
  let service: PspWebhooksService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T12:00:00-03:00'));
    repository = new InMemoryChargeRepository();
    service = new PspWebhooksService(repository);
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

  it('keeps Pix at the original amount after its due date', () => {
    const charge = createCharge('charge-pix', createPixInstrument());
    repository.save(charge);
    const input = createPixInput();
    input.paidAt = '2026-08-25T12:00:00-03:00';

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
