import { Charge } from './charge';
import { ChargeStateError, ChargeValidationError } from './domain-error';
import type {
  BoletoPaymentInstrument,
  PixPaymentInstrument,
} from './payment-instrument';
import type { Payer } from './payer';
import { PayerDocument } from './payer-document';

function createBoletoInstrument(): BoletoPaymentInstrument {
  return {
    type: 'BOLETO',
    nossoNumero: '123456789',
    digitableLine: '00190.00009 01234.567890 12345.678901 1 12340000010000',
    barcode: '00191123400000100000000012345678901234567890',
  };
}

function createPixInstrument(): PixPaymentInstrument {
  return {
    type: 'PIX',
    txid: 'charge-pix-123',
    brCode: '00020101021226850014br.gov.bcb.pix',
    qrCode: 'data:image/png;base64,pix-example',
  };
}

function createPayer(): Payer {
  return {
    name: 'Maria Souza',
    document: new PayerDocument('529.982.247-25'),
    email: 'maria@example.com',
  };
}

const VALID_DUE_DATE = '2026-08-15';
const VALID_DESCRIPTION = 'Serviço de manutenção';

function createBoletoCharge(
  amountInCents = 1_000,
  description = VALID_DESCRIPTION,
  dueDate = VALID_DUE_DATE,
): Charge {
  return new Charge({
    id: 'charge-boleto-1',
    paymentInstrument: createBoletoInstrument(),
    amountInCents,
    payer: createPayer(),
    dueDate,
    description,
  });
}

function createPixCharge(amountInCents = 1): Charge {
  return new Charge({
    id: 'charge-pix-1',
    paymentInstrument: createPixInstrument(),
    amountInCents,
    payer: createPayer(),
    dueDate: VALID_DUE_DATE,
    description: VALID_DESCRIPTION,
  });
}

describe('Charge', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T12:00:00-03:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('creation', () => {
    it('starts a new charge as pending', () => {
      const charge = createBoletoCharge();

      expect(charge.status).toBe('PENDING');
    });

    it('derives boleto as the payment method', () => {
      const charge = createBoletoCharge();

      expect(charge.paymentMethod).toBe('BOLETO');
    });

    it('derives Pix as the payment method', () => {
      const charge = createPixCharge();

      expect(charge.paymentMethod).toBe('PIX');
    });

    it('exposes the provided identifier through its getter', () => {
      const charge = createBoletoCharge();

      expect(charge.id).toBe('charge-boleto-1');
    });

    it('exposes the provided payment instrument through its getter', () => {
      const instrument = createPixInstrument();
      const charge = new Charge({
        id: 'charge-pix-2',
        paymentInstrument: instrument,
        amountInCents: 1,
        payer: createPayer(),
        dueDate: VALID_DUE_DATE,
        description: VALID_DESCRIPTION,
      });

      expect(charge.paymentInstrument).toBe(instrument);
    });
  });

  describe('cancel', () => {
    it('cancels a pending charge', () => {
      const charge = createBoletoCharge();

      charge.cancel();

      expect(charge.status).toBe('CANCELLED');
    });

    it('does not cancel a paid charge', () => {
      const charge = createBoletoCharge();
      charge.markAsPaid();

      expect(() => charge.cancel()).toThrow(ChargeStateError);
    });

    it('does not cancel an already cancelled charge', () => {
      const charge = createBoletoCharge();
      charge.cancel();

      expect(() => charge.cancel()).toThrow(ChargeStateError);
    });

    it('does not cancel an expired charge', () => {
      const charge = createPixCharge();
      charge.expire();

      expect(() => charge.cancel()).toThrow(ChargeStateError);
    });
  });

  describe('markAsPaid', () => {
    it('marks a pending charge as paid', () => {
      const charge = createBoletoCharge();

      charge.markAsPaid();

      expect(charge.status).toBe('PAID');
    });

    it('does not pay an already paid charge', () => {
      const charge = createBoletoCharge();
      charge.markAsPaid();

      expect(() => charge.markAsPaid()).toThrow(ChargeStateError);
    });

    it('does not pay a cancelled charge', () => {
      const charge = createBoletoCharge();
      charge.cancel();

      expect(() => charge.markAsPaid()).toThrow(ChargeStateError);
    });

    it('does not pay an expired charge', () => {
      const charge = createPixCharge();
      charge.expire();

      expect(() => charge.markAsPaid()).toThrow(ChargeStateError);
    });
  });

  describe('expire', () => {
    it('expires a pending Pix charge', () => {
      const charge = createPixCharge();

      charge.expire();

      expect(charge.status).toBe('EXPIRED');
    });

    it('does not expire a boleto charge', () => {
      const charge = createBoletoCharge();

      expect(() => charge.expire()).toThrow(ChargeStateError);
    });

    it('does not expire a paid Pix charge', () => {
      const charge = createPixCharge();
      charge.markAsPaid();

      expect(() => charge.expire()).toThrow(ChargeStateError);
    });

    it('does not expire a cancelled Pix charge', () => {
      const charge = createPixCharge();
      charge.cancel();

      expect(() => charge.expire()).toThrow(ChargeStateError);
    });

    it('does not expire an already expired Pix charge', () => {
      const charge = createPixCharge();
      charge.expire();

      expect(() => charge.expire()).toThrow(ChargeStateError);
    });
  });

  describe('reconcileExpiredPixPayment', () => {
    it.each([
      ['on the due date', '2026-08-15T12:00:00-03:00'],
      ['on the third tolerance day', '2026-08-18T23:59:59-03:00'],
    ])('reconciles expired Pix %s', (_name, paidAt) => {
      const charge = createPixCharge();
      charge.expire();

      charge.reconcileExpiredPixPayment(new Date(paidAt));

      expect(charge.status).toBe('PAID');
    });

    it('rejects a payment made on the fourth day', () => {
      const charge = createPixCharge();
      charge.expire();

      expect(() =>
        charge.reconcileExpiredPixPayment(
          new Date('2026-08-19T00:00:00-03:00'),
        ),
      ).toThrow(ChargeStateError);
      expect(charge.status).toBe('EXPIRED');
    });

    it('changes reconciled Pix status to paid', () => {
      const charge = createPixCharge();
      charge.expire();

      charge.reconcileExpiredPixPayment(new Date('2026-08-15T12:00:00-03:00'));

      expect(charge.status).toBe('PAID');
    });

    it('keeps Pix expired after rejecting a late reconciliation', () => {
      const charge = createPixCharge();
      charge.expire();

      expect(() =>
        charge.reconcileExpiredPixPayment(
          new Date('2026-08-19T12:00:00-03:00'),
        ),
      ).toThrow(ChargeStateError);
      expect(charge.status).toBe('EXPIRED');
    });

    it('rejects reconciliation for boleto', () => {
      expect(() =>
        createBoletoCharge().reconcileExpiredPixPayment(
          new Date('2026-08-15T12:00:00-03:00'),
        ),
      ).toThrow(ChargeStateError);
    });

    it.each(['PENDING', 'PAID', 'CANCELLED'] as const)(
      'rejects reconciliation for Pix with status %s',
      (status) => {
        const charge = createPixCharge();

        if (status === 'PAID') {
          charge.markAsPaid();
        } else if (status === 'CANCELLED') {
          charge.cancel();
        }

        expect(() =>
          charge.reconcileExpiredPixPayment(
            new Date('2026-08-15T12:00:00-03:00'),
          ),
        ).toThrow(ChargeStateError);
      },
    );

    it('rejects an invalid payment date', () => {
      const charge = createPixCharge();
      charge.expire();

      expect(() =>
        charge.reconcileExpiredPixPayment(new Date('invalid')),
      ).toThrow(ChargeStateError);
    });
  });

  describe('amount validation', () => {
    it('stores and exposes the original amount in cents', () => {
      const charge = createBoletoCharge(12_345);

      expect(charge.amountInCents).toBe(12_345);
    });

    it('accepts a boleto at its minimum amount', () => {
      const createCharge = (): Charge => createBoletoCharge(1_000);

      expect(createCharge).not.toThrow();
    });

    it('rejects a boleto below its minimum amount', () => {
      const createCharge = (): Charge => createBoletoCharge(999);

      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('accepts Pix at its minimum amount', () => {
      const createCharge = (): Charge => createPixCharge(1);

      expect(createCharge).not.toThrow();
    });

    it('rejects Pix below its minimum amount', () => {
      const createCharge = (): Charge => createPixCharge(0);

      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('accepts a boleto at the maximum amount', () => {
      const createCharge = (): Charge => createBoletoCharge(100_000_000);

      expect(createCharge).not.toThrow();
    });

    it('accepts Pix at the maximum amount', () => {
      const createCharge = (): Charge => createPixCharge(100_000_000);

      expect(createCharge).not.toThrow();
    });

    it('rejects a boleto above the maximum amount', () => {
      const createCharge = (): Charge => createBoletoCharge(100_000_001);

      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects Pix above the maximum amount', () => {
      const createCharge = (): Charge => createPixCharge(100_000_001);

      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a decimal amount in cents', () => {
      const createCharge = (): Charge => createBoletoCharge(1_000.5);

      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a negative boleto amount', () => {
      const createCharge = (): Charge => createBoletoCharge(-1);

      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a negative Pix amount', () => {
      const createCharge = (): Charge => createPixCharge(-1);

      expect(createCharge).toThrow(ChargeValidationError);
    });
  });

  describe('required data', () => {
    it('exposes the payer', () => {
      const charge = createBoletoCharge();

      expect(charge.payer.name).toBe('Maria Souza');
      expect(charge.payer.email).toBe('maria@example.com');
    });

    it('exposes the normalized payer document', () => {
      const charge = createBoletoCharge();

      expect(charge.payer.document.value).toBe('52998224725');
    });

    it('exposes the due date', () => {
      const charge = createBoletoCharge();

      expect(charge.dueDate).toBe('2026-08-15');
    });

    it('exposes the description', () => {
      const charge = createBoletoCharge();

      expect(charge.description).toBe('Serviço de manutenção');
    });

    it('trims surrounding spaces from the description', () => {
      const charge = createBoletoCharge(1_000, '  Manutenção preventiva  ');

      expect(charge.description).toBe('Manutenção preventiva');
    });

    it('rejects an empty description', () => {
      const createCharge = (): Charge => createBoletoCharge(1_000, '   ');

      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a past due date', () => {
      const createCharge = (): Charge =>
        createBoletoCharge(1_000, VALID_DESCRIPTION, '2026-08-09');

      expect(createCharge).toThrow(ChargeValidationError);
    });
  });
});
