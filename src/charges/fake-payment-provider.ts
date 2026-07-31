import { randomUUID } from 'node:crypto';

import type { PaymentInstrument } from '../domain/payment-instrument';
import type { PaymentMethod } from '../domain/payment-method';

/**
 * Simula um PSP dentro do próprio processo para permitir o desenvolvimento das
 * regras de cobrança sem depender de uma integração bancária externa nesta fase.
 * Os instrumentos gerados são plausíveis para testes, mas não são códigos
 * bancariamente válidos para pagamentos reais.
 */
export class FakePaymentProvider {
  private shouldFailNextRequest = false;

  /**
   * A latência aproxima o comportamento assíncrono de uma chamada externa. O
   * valor pode ser zero nos testes para mantê-los rápidos.
   */
  constructor(private readonly latencyInMilliseconds = 10) {}

  /** Gera um instrumento correspondente ao método de pagamento solicitado. */
  async issue(paymentMethod: PaymentMethod): Promise<PaymentInstrument> {
    // A sinalização é consumida antes da espera para afetar exatamente uma
    // emissão, fazendo o provedor voltar ao funcionamento normal em seguida.
    const shouldFail = this.shouldFailNextRequest;
    this.shouldFailNextRequest = false;

    await this.delay();

    if (shouldFail) {
      throw new Error('Payment provider failed to issue the charge.');
    }

    if (paymentMethod === 'BOLETO') {
      return {
        type: 'BOLETO',
        nossoNumero: this.createNumericCode(20),
        digitableLine: this.createNumericCode(47),
        barcode: this.createNumericCode(44),
      };
    }

    const txid = randomUUID();

    return {
      type: 'PIX',
      txid,
      brCode: `00020101021226850014br.gov.bcb.pix-${txid}`,
      qrCode: `data:image/png;base64,fake-pix-${txid}`,
    };
  }

  /** Faz somente a próxima chamada de `issue` simular uma falha do PSP. */
  failNextRequest(): void {
    this.shouldFailNextRequest = true;
  }

  /** Aguarda a latência configurada sem bloquear a execução do processo. */
  private delay(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this.latencyInMilliseconds);
    });
  }

  /** Cria uma sequência numérica plausível a partir de UUIDs aleatórios. */
  private createNumericCode(length: number): string {
    let code = '';

    while (code.length < length) {
      const hexadecimalCharacters = randomUUID().replaceAll('-', '');
      code += [...hexadecimalCharacters]
        .map((character) => Number.parseInt(character, 16) % 10)
        .join('');
    }

    return code.slice(0, length);
  }
}
