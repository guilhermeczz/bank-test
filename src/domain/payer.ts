import type { PayerDocument } from './payer-document';

/**
 * Reúne os dados do pagador necessários nesta etapa. Uma interface é suficiente
 * porque ainda não há comportamento próprio: o CPF/CNPJ já é validado por
 * `PayerDocument`, e nome e e-mail serão validados posteriormente pelo DTO HTTP.
 */
export interface Payer {
  readonly name: string;
  readonly document: PayerDocument;
  readonly email: string;
}
