export type PaymentDivergenceReason = 'AMOUNT_MISMATCH';

/**
 * Registra separadamente uma tentativa de pagamento com valor divergente. A
 * cobrança mantém suas regras de estado, enquanto este registro imutável guarda
 * os dados recebidos para consulta interna futura. Valores permanecem em
 * centavos para preservar a mesma precisão utilizada pelo domínio.
 */
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
