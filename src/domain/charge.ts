import { validateChargeAmount } from './charge-amount';
import { validateDueDate } from './charge-date';
import type { ChargeStatus } from './charge-status';
import { ChargeStateError, ChargeValidationError } from './domain-error';
import type { Payer } from './payer';
import type { PaymentInstrument } from './payment-instrument';
import type { PaymentMethod } from './payment-method';
import { evaluatePixExpiration } from './pix-expiration';

export interface ChargeProps {
  id: string;

  paymentInstrument: PaymentInstrument;

  amountInCents: number;

  payer: Payer;

  dueDate: string;

  description: string;
}

export class Charge {
  private readonly chargeId: string;

  private readonly instrument: PaymentInstrument;

  private readonly originalAmountInCents: number;

  private readonly chargePayer: Payer;
  private readonly dueDateValue: string;
  private readonly chargeDescription: string;

  private currentStatus: ChargeStatus;

  constructor(props: ChargeProps) {
    const paymentMethod = props.paymentInstrument.type;
    validateChargeAmount(props.amountInCents, paymentMethod);
    validateDueDate(props.dueDate, new Date());

    const description = props.description.trim();

    if (description.length === 0) {
      throw new ChargeValidationError('Charge description cannot be empty.');
    }

    this.chargeId = props.id;
    this.instrument = props.paymentInstrument;
    this.originalAmountInCents = props.amountInCents;
    this.chargePayer = props.payer;
    this.dueDateValue = props.dueDate;
    this.chargeDescription = description;
    this.currentStatus = 'PENDING';
  }

  get id(): string {
    return this.chargeId;
  }

  get status(): ChargeStatus {
    return this.currentStatus;
  }

  get paymentInstrument(): PaymentInstrument {
    return this.instrument;
  }

  get paymentMethod(): PaymentMethod {
    // Derivar o método evita manter dados duplicados que poderiam se contradizer.
    return this.instrument.type;
  }

  get amountInCents(): number {
    return this.originalAmountInCents;
  }

  get payer(): Payer {
    return this.chargePayer;
  }

  get dueDate(): string {
    return this.dueDateValue;
  }

  get description(): string {
    return this.chargeDescription;
  }

  cancel(): void {
    if (this.currentStatus !== 'PENDING') {
      throw new ChargeStateError(
        `Cannot cancel a charge with status ${this.currentStatus}.`,
      );
    }

    this.currentStatus = 'CANCELLED';
  }

  markAsPaid(): void {
    if (this.currentStatus !== 'PENDING') {
      throw new ChargeStateError(
        `Cannot mark as paid a charge with status ${this.currentStatus}.`,
      );
    }

    this.currentStatus = 'PAID';
  }

  expire(): void {
    if (this.instrument.type !== 'PIX') {
      throw new ChargeStateError('Only Pix charges can expire.');
    }

    if (this.currentStatus !== 'PENDING') {
      throw new ChargeStateError(
        `Cannot expire a charge with status ${this.currentStatus}.`,
      );
    }

    this.currentStatus = 'EXPIRED';
  }

  reconcileExpiredPixPayment(paidAt: Date): void {
    if (this.instrument.type !== 'PIX') {
      throw new ChargeStateError('Only Pix charges can reconcile expiration.');
    }

    if (this.currentStatus !== 'EXPIRED') {
      throw new ChargeStateError(
        `Cannot reconcile a Pix charge with status ${this.currentStatus}.`,
      );
    }

    if (!(paidAt instanceof Date) || Number.isNaN(paidAt.getTime())) {
      throw new ChargeStateError('Payment date is invalid.');
    }

    const evaluation = evaluatePixExpiration(this.dueDateValue, paidAt);

    if (evaluation.isExpired) {
      throw new ChargeStateError(
        'Pix payment occurred after the tolerance period.',
      );
    }

    // O estado expirou antes da confirmação chegar, mas `paidAt` comprova
    // que o pagamento ocorreu no prazo: trata-se de reconciliação fora de ordem.
    this.currentStatus = 'PAID';
  }
}
