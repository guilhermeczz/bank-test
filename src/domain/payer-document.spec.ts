import { PayerDocumentValidationError } from './domain-error';
import { PayerDocument } from './payer-document';

describe('PayerDocument', () => {
  describe('CPF', () => {
    it('accepts a valid formatted CPF', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247-25');

      expect(createDocument).not.toThrow();
    });

    it('accepts a valid unformatted CPF', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('52998224725');

      expect(createDocument).not.toThrow();
    });

    it('returns the normalized CPF', () => {
      const document = new PayerDocument('529.982.247-25');

      expect(document.value).toBe('52998224725');
    });

    it('identifies the document as CPF', () => {
      const document = new PayerDocument('52998224725');

      expect(document.type).toBe('CPF');
    });

    it('rejects a CPF with invalid check digits', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247-24');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a CPF containing repeated digits', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('11111111111');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });
  });

  describe('CNPJ', () => {
    it('accepts a valid formatted CNPJ', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('04.252.011/0001-10');

      expect(createDocument).not.toThrow();
    });

    it('accepts a valid unformatted CNPJ', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('04252011000110');

      expect(createDocument).not.toThrow();
    });

    it('returns the normalized CNPJ', () => {
      const document = new PayerDocument('04.252.011/0001-10');

      expect(document.value).toBe('04252011000110');
    });

    it('identifies the document as CNPJ', () => {
      const document = new PayerDocument('04252011000110');

      expect(document.type).toBe('CNPJ');
    });

    it('rejects a CNPJ with invalid check digits', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('04.252.011/0001-11');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a CNPJ containing repeated digits', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('00000000000000');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });
  });

  describe('invalid input', () => {
    it('rejects an empty document', () => {
      const createDocument = (): PayerDocument => new PayerDocument('');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a document with an invalid number of digits', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('1234567890');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a document containing letters', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247-2A');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a document containing unsupported special characters', () => {
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247@25');

      expect(createDocument).toThrow(PayerDocumentValidationError);
    });
  });
});
