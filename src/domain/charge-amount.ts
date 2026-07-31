import { ChargeValidationError } from './domain-error';
import type { PaymentMethod } from './payment-method';

/**
 * Este arquivo concentra os limites monetários usados na criação de cobranças.
 * Dinheiro é armazenado em centavos inteiros para evitar imprecisões dos números
 * decimais binários do JavaScript, que podem tornar cálculos em reais inexatos.
 */

/**
 * Os limites são constantes porque fazem parte das regras fixas desta versão do
 * domínio. Os separadores `_` melhoram a leitura sem alterar o valor numérico.
 */
export const BOLETO_MIN_AMOUNT_IN_CENTS = 1_000;
export const PIX_MIN_AMOUNT_IN_CENTS = 1;
export const MAX_AMOUNT_IN_CENTS = 100_000_000;

/**
 * Verifica se o valor original atende às regras do método de pagamento.
 * A validação pertence ao domínio porque os limites são regras de negócio e
 * precisam valer independentemente de controller, banco ou outra camada futura.
 *
 * `Number.isInteger` confirma que o número não possui parte decimal. Valores
 * como `1000.5` são rejeitados em vez de arredondados silenciosamente.
 * O retorno `void` indica que a função não produz um valor: ela termina sem erro
 * quando a entrada é válida ou interrompe o fluxo lançando uma exceção.
 */
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

  // O boleto possui custo e regras operacionais diferentes do Pix, por isso
  // cada método possui seu próprio limite mínimo.
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
