import type { PayerDocument } from './payer-document';

export interface Payer {
  readonly name: string;
  readonly document: PayerDocument;
  readonly email: string;
}
