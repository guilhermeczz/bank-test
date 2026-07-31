import { PayerDocumentValidationError } from './domain-error';
import { PayerDocument } from './payer-document';

/**
 * Estes testes comprovam normalização, identificação e dígitos verificadores.
 * Cada cenário segue preparação, execução e verificação para deixar claro qual
 * entrada foi usada, quando o objeto foi criado e qual resultado era esperado.
 */
describe('PayerDocument', () => {
  describe('CPF', () => {
    it('accepts a valid formatted CPF', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247-25');

      // Verificação
      expect(createDocument).not.toThrow();
    });

    it('accepts a valid unformatted CPF', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('52998224725');

      // Verificação
      expect(createDocument).not.toThrow();
    });

    it('returns the normalized CPF', () => {
      // Preparação e execução
      const document = new PayerDocument('529.982.247-25');

      // Verificação
      expect(document.value).toBe('52998224725');
    });

    it('identifies the document as CPF', () => {
      // Preparação e execução
      const document = new PayerDocument('52998224725');

      // Verificação
      expect(document.type).toBe('CPF');
    });

    it('rejects a CPF with invalid check digits', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247-24');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a CPF containing repeated digits', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('11111111111');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });
  });

  describe('CNPJ', () => {
    it('accepts a valid formatted CNPJ', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('04.252.011/0001-10');

      // Verificação
      expect(createDocument).not.toThrow();
    });

    it('accepts a valid unformatted CNPJ', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('04252011000110');

      // Verificação
      expect(createDocument).not.toThrow();
    });

    it('returns the normalized CNPJ', () => {
      // Preparação e execução
      const document = new PayerDocument('04.252.011/0001-10');

      // Verificação
      expect(document.value).toBe('04252011000110');
    });

    it('identifies the document as CNPJ', () => {
      // Preparação e execução
      const document = new PayerDocument('04252011000110');

      // Verificação
      expect(document.type).toBe('CNPJ');
    });

    it('rejects a CNPJ with invalid check digits', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('04.252.011/0001-11');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a CNPJ containing repeated digits', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('00000000000000');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });
  });

  describe('invalid input', () => {
    it('rejects an empty document', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument => new PayerDocument('');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a document with an invalid number of digits', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('1234567890');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a document containing letters', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247-2A');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });

    it('rejects a document containing unsupported special characters', () => {
      // Preparação e execução
      const createDocument = (): PayerDocument =>
        new PayerDocument('529.982.247@25');

      // Verificação
      expect(createDocument).toThrow(PayerDocumentValidationError);
    });
  });
});
