import { Charge } from './charge';
import { ChargeStateError, ChargeValidationError } from './domain-error';
import type {
  BoletoPaymentInstrument,
  PixPaymentInstrument,
} from './payment-instrument';
import type { Payer } from './payer';
import { PayerDocument } from './payer-document';

/**
 * Este arquivo comprova as regras públicas da entidade Charge com testes
 * unitários. Cada teste segue o padrão AAA: preparação dos dados (Arrange),
 * execução do comportamento (Act) e verificação do resultado (Assert).
 */

/** Cria dados válidos de boleto sem depender de serviços externos. */
function createBoletoInstrument(): BoletoPaymentInstrument {
  return {
    type: 'BOLETO',
    nossoNumero: '123456789',
    digitableLine: '00190.00009 01234.567890 12345.678901 1 12340000010000',
    barcode: '00191123400000100000000012345678901234567890',
  };
}

/** Cria dados válidos de Pix para manter os testes curtos e legíveis. */
function createPixInstrument(): PixPaymentInstrument {
  return {
    type: 'PIX',
    txid: 'charge-pix-123',
    brCode: '00020101021226850014br.gov.bcb.pix',
    qrCode: 'data:image/png;base64,pix-example',
  };
}

/** Cria o pagador padrão; a validade do CPF é garantida por `PayerDocument`. */
function createPayer(): Payer {
  return {
    name: 'Maria Souza',
    document: new PayerDocument('529.982.247-25'),
    email: 'maria@example.com',
  };
}

const VALID_DUE_DATE = '2026-08-15';
const VALID_DESCRIPTION = 'Serviço de manutenção';

/** Cria uma cobrança de boleto com identidade previsível para os testes. */
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

/** Cria uma cobrança Pix nova, que sempre começa no estado pendente. */
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
  // O relógio controlado evita que os cenários dependam da data real da máquina.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T12:00:00-03:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('creation', () => {
    it('starts a new charge as pending', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(charge.status).toBe('PENDING');
    });

    it('derives boleto as the payment method', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(charge.paymentMethod).toBe('BOLETO');
    });

    it('derives Pix as the payment method', () => {
      // Preparação
      const charge = createPixCharge();

      // Execução e verificação
      expect(charge.paymentMethod).toBe('PIX');
    });

    it('exposes the provided identifier through its getter', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(charge.id).toBe('charge-boleto-1');
    });

    it('exposes the provided payment instrument through its getter', () => {
      // Preparação
      const instrument = createPixInstrument();
      const charge = new Charge({
        id: 'charge-pix-2',
        paymentInstrument: instrument,
        amountInCents: 1,
        payer: createPayer(),
        dueDate: VALID_DUE_DATE,
        description: VALID_DESCRIPTION,
      });

      // Execução e verificação
      expect(charge.paymentInstrument).toBe(instrument);
    });
  });

  describe('cancel', () => {
    it('cancels a pending charge', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução
      charge.cancel();

      // Verificação
      expect(charge.status).toBe('CANCELLED');
    });

    it('does not cancel a paid charge', () => {
      // Preparação
      const charge = createBoletoCharge();
      charge.markAsPaid();

      // Execução e verificação
      expect(() => charge.cancel()).toThrow(ChargeStateError);
    });

    it('does not cancel an already cancelled charge', () => {
      // Preparação
      const charge = createBoletoCharge();
      charge.cancel();

      // Execução e verificação
      expect(() => charge.cancel()).toThrow(ChargeStateError);
    });

    it('does not cancel an expired charge', () => {
      // Preparação
      const charge = createPixCharge();
      charge.expire();

      // Execução e verificação
      expect(() => charge.cancel()).toThrow(ChargeStateError);
    });
  });

  describe('markAsPaid', () => {
    it('marks a pending charge as paid', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução
      charge.markAsPaid();

      // Verificação
      expect(charge.status).toBe('PAID');
    });

    it('does not pay an already paid charge', () => {
      // Preparação
      const charge = createBoletoCharge();
      charge.markAsPaid();

      // Execução e verificação
      expect(() => charge.markAsPaid()).toThrow(ChargeStateError);
    });

    it('does not pay a cancelled charge', () => {
      // Preparação
      const charge = createBoletoCharge();
      charge.cancel();

      // Execução e verificação
      expect(() => charge.markAsPaid()).toThrow(ChargeStateError);
    });

    it('does not pay an expired charge', () => {
      // Preparação
      const charge = createPixCharge();
      charge.expire();

      // Execução e verificação
      expect(() => charge.markAsPaid()).toThrow(ChargeStateError);
    });
  });

  describe('expire', () => {
    it('expires a pending Pix charge', () => {
      // Preparação
      const charge = createPixCharge();

      // Execução
      charge.expire();

      // Verificação
      expect(charge.status).toBe('EXPIRED');
    });

    it('does not expire a boleto charge', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(() => charge.expire()).toThrow(ChargeStateError);
    });

    it('does not expire a paid Pix charge', () => {
      // Preparação
      const charge = createPixCharge();
      charge.markAsPaid();

      // Execução e verificação
      expect(() => charge.expire()).toThrow(ChargeStateError);
    });

    it('does not expire a cancelled Pix charge', () => {
      // Preparação
      const charge = createPixCharge();
      charge.cancel();

      // Execução e verificação
      expect(() => charge.expire()).toThrow(ChargeStateError);
    });

    it('does not expire an already expired Pix charge', () => {
      // Preparação
      const charge = createPixCharge();
      charge.expire();

      // Execução e verificação
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

  /**
   * Estes testes exercitam os valores exatamente nos limites e imediatamente
   * fora deles. Isso ajuda a detectar comparações inclusivas incorretas sem
   * prender os testes ao texto exato das mensagens de validação.
   */
  describe('amount validation', () => {
    it('stores and exposes the original amount in cents', () => {
      // Preparação
      const charge = createBoletoCharge(12_345);

      // Execução e verificação
      expect(charge.amountInCents).toBe(12_345);
    });

    it('accepts a boleto at its minimum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createBoletoCharge(1_000);

      // Verificação
      expect(createCharge).not.toThrow();
    });

    it('rejects a boleto below its minimum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createBoletoCharge(999);

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('accepts Pix at its minimum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createPixCharge(1);

      // Verificação
      expect(createCharge).not.toThrow();
    });

    it('rejects Pix below its minimum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createPixCharge(0);

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('accepts a boleto at the maximum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createBoletoCharge(100_000_000);

      // Verificação
      expect(createCharge).not.toThrow();
    });

    it('accepts Pix at the maximum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createPixCharge(100_000_000);

      // Verificação
      expect(createCharge).not.toThrow();
    });

    it('rejects a boleto above the maximum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createBoletoCharge(100_000_001);

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects Pix above the maximum amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createPixCharge(100_000_001);

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a decimal amount in cents', () => {
      // Preparação e execução
      const createCharge = (): Charge => createBoletoCharge(1_000.5);

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a negative boleto amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createBoletoCharge(-1);

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a negative Pix amount', () => {
      // Preparação e execução
      const createCharge = (): Charge => createPixCharge(-1);

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });
  });

  describe('required data', () => {
    it('exposes the payer', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(charge.payer.name).toBe('Maria Souza');
      expect(charge.payer.email).toBe('maria@example.com');
    });

    it('exposes the normalized payer document', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(charge.payer.document.value).toBe('52998224725');
    });

    it('exposes the due date', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(charge.dueDate).toBe('2026-08-15');
    });

    it('exposes the description', () => {
      // Preparação
      const charge = createBoletoCharge();

      // Execução e verificação
      expect(charge.description).toBe('Serviço de manutenção');
    });

    it('trims surrounding spaces from the description', () => {
      // Preparação e execução
      const charge = createBoletoCharge(1_000, '  Manutenção preventiva  ');

      // Verificação
      expect(charge.description).toBe('Manutenção preventiva');
    });

    it('rejects an empty description', () => {
      // Preparação e execução
      const createCharge = (): Charge => createBoletoCharge(1_000, '   ');

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });

    it('rejects a past due date', () => {
      // Preparação e execução
      const createCharge = (): Charge =>
        createBoletoCharge(1_000, VALID_DESCRIPTION, '2026-08-09');

      // Verificação
      expect(createCharge).toThrow(ChargeValidationError);
    });
  });
});
