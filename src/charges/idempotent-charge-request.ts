export interface IdempotentChargeRequest {
  readonly key: string;
  readonly requestHash: string;
  readonly chargeId: string;
  readonly createdAt: string;
}
