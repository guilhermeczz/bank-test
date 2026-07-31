export interface BoletoPaymentInstrument {
  readonly type: 'BOLETO';

  readonly nossoNumero: string;

  readonly digitableLine: string;

  readonly barcode: string;
}

export interface PixPaymentInstrument {
  readonly type: 'PIX';

  readonly txid: string;

  readonly brCode: string;

  readonly qrCode: string;
}

// O discriminador `type` libera somente os campos do instrumento correspondente
// e impede combinações inválidas entre boleto e Pix.
export type PaymentInstrument = BoletoPaymentInstrument | PixPaymentInstrument;
