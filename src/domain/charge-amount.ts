import { ChargeValidationError } from './domain-error';
import type { PaymentMethod } from './payment-method';

// Inteiros em centavos evitam a imprecisão de decimais em cálculos financeiros.
export const BOLETO_MIN_AMOUNT_IN_CENTS = 1_000;
export const PIX_MIN_AMOUNT_IN_CENTS = 1;
export const MAX_AMOUNT_IN_CENTS = 100_000_000;

export function validateChargeAmount(
  amountInCents: number,
  paymentMethod: PaymentMethod,
): void {
  if (!Number.isInteger(amountInCents)) {
    throw new ChargeValidationError(
      'Charge amount in cents must be an integer.',
    );
  }

  if (amountInCents > MAX_AMOUNT_IN_CENTS) {
    throw new ChargeValidationError(
      `Charge amount cannot exceed ${MAX_AMOUNT_IN_CENTS} cents.`,
    );
  }

  if (
    paymentMethod === 'BOLETO' &&
    amountInCents < BOLETO_MIN_AMOUNT_IN_CENTS
  ) {
    throw new ChargeValidationError(
      `Boleto amount must be at least ${BOLETO_MIN_AMOUNT_IN_CENTS} cents.`,
    );
  }

  if (paymentMethod === 'PIX' && amountInCents < PIX_MIN_AMOUNT_IN_CENTS) {
    throw new ChargeValidationError(
      `Pix amount must be at least ${PIX_MIN_AMOUNT_IN_CENTS} cent.`,
    );
  }
}
