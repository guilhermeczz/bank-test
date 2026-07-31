export type PaymentDivergenceReason = 'AMOUNT_MISMATCH';

// Registro imutável separado da cobrança; os valores permanecem em centavos.
export interface PaymentDivergence {
  readonly id: string;
  readonly chargeId: string;
  readonly event: 'boleto.paid' | 'pix.paid';
  readonly paymentReference: string;
  readonly endToEndId?: string;
  readonly paidAmount: number;
  readonly expectedAmount: number;
  readonly paidAt: string;
  readonly reason: PaymentDivergenceReason;
  readonly createdAt: string;
}
