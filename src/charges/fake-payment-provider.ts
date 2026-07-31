import { randomUUID } from 'node:crypto';

import type { PaymentInstrument } from '../domain/payment-instrument';
import type { PaymentMethod } from '../domain/payment-method';

// PSP em processo com latência simulada e dados plausíveis, mas não bancariamente válidos.
export class FakePaymentProvider {
  private shouldFailNextRequest = false;

  constructor(private readonly latencyInMilliseconds = 10) {}

  async issue(paymentMethod: PaymentMethod): Promise<PaymentInstrument> {
    const shouldFail = this.shouldFailNextRequest;
    // A falha é consumida agora para afetar somente esta emissão.
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

  failNextRequest(): void {
    this.shouldFailNextRequest = true;
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this.latencyInMilliseconds);
    });
  }

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
