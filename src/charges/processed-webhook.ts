import type { PspWebhookProcessingResult } from './psp-webhooks.service';

export type PaidWebhookProcessingResult = Extract<
  PspWebhookProcessingResult,
  {
    readonly event: 'boleto.paid' | 'pix.paid';
    readonly status: 'PAID';
  }
>;

export type ProcessedWebhookOutcome =
  | {
      readonly type: 'PAID';
      readonly result: PaidWebhookProcessingResult;
    }
  | {
      readonly type: 'AMOUNT_MISMATCH';
      readonly paidAmount: number;
      readonly expectedAmount: number;
    };

/** Guarda o resultado imutável de uma notificação que já produziu efeito. */
export interface ProcessedWebhook {
  readonly key: string;
  readonly chargeId: string;
  readonly event: 'boleto.paid' | 'pix.paid';
  readonly outcome: ProcessedWebhookOutcome;
  readonly processedAt: string;
}
