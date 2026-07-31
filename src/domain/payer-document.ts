import { PayerDocumentValidationError } from './domain-error';

export type PayerDocumentType = 'CPF' | 'CNPJ';

export class PayerDocument {
  private readonly normalizedValue: string;

  private readonly documentType: PayerDocumentType;

  constructor(value: string) {
    const normalizedValue = this.normalize(value);
    const documentType = this.identifyType(normalizedValue);

    this.ensureDigitsAreNotRepeated(normalizedValue);

    const isValid =
      documentType === 'CPF'
        ? this.isValidCpf(normalizedValue)
        : this.isValidCnpj(normalizedValue);

    if (!isValid) {
      throw new PayerDocumentValidationError(
        `${documentType} has invalid check digits.`,
      );
    }

    this.normalizedValue = normalizedValue;
    this.documentType = documentType;
  }

  get value(): string {
    return this.normalizedValue;
  }

  get type(): PayerDocumentType {
    return this.documentType;
  }

  private normalize(value: string): string {
    if (value.length === 0) {
      throw new PayerDocumentValidationError('Payer document cannot be empty.');
    }

    // Validar antes de remover a pontuação impede aceitar letras silenciosamente.
    if (!/^[0-9.\-/]+$/.test(value)) {
      throw new PayerDocumentValidationError(
        'Payer document contains unsupported characters.',
      );
    }

    return value.replace(/[.\-/]/g, '');
  }

  private identifyType(value: string): PayerDocumentType {
    if (value.length === 11) {
      return 'CPF';
    }

    if (value.length === 14) {
      return 'CNPJ';
    }

    throw new PayerDocumentValidationError(
      'Payer document must contain 11 or 14 digits.',
    );
  }

  private ensureDigitsAreNotRepeated(value: string): void {
    // Sequências repetidas não representam documentos válidos.
    if (/^(\d)\1+$/.test(value)) {
      throw new PayerDocumentValidationError(
        'Payer document cannot contain only repeated digits.',
      );
    }
  }

  private isValidCpf(value: string): boolean {
    // Cada dígito do CPF usa pesos decrescentes sobre a base anterior.
    const digits = this.toDigits(value);
    const firstCheckDigit = this.calculateCpfCheckDigit(digits.slice(0, 9), 10);
    const secondCheckDigit = this.calculateCpfCheckDigit(
      [...digits.slice(0, 9), firstCheckDigit],
      11,
    );

    return firstCheckDigit === digits[9] && secondCheckDigit === digits[10];
  }

  private calculateCpfCheckDigit(
    digits: readonly number[],
    initialWeight: number,
  ): number {
    const sum = digits.reduce(
      (total, digit, index) => total + digit * (initialWeight - index),
      0,
    );
    const result = (sum * 10) % 11;

    return result === 10 ? 0 : result;
  }

  private isValidCnpj(value: string): boolean {
    // Os dígitos do CNPJ usam duas sequências específicas de pesos.
    const digits = this.toDigits(value);
    const baseDigits = digits.slice(0, 12);
    const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const firstCheckDigit = this.calculateCnpjCheckDigit(
      baseDigits,
      firstWeights,
    );
    const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const secondCheckDigit = this.calculateCnpjCheckDigit(
      [...baseDigits, firstCheckDigit],
      secondWeights,
    );

    return firstCheckDigit === digits[12] && secondCheckDigit === digits[13];
  }

  private calculateCnpjCheckDigit(
    digits: readonly number[],
    weights: readonly number[],
  ): number {
    const sum = digits.reduce(
      (total, digit, index) => total + digit * weights[index],
      0,
    );
    const remainder = sum % 11;

    return remainder < 2 ? 0 : 11 - remainder;
  }

  private toDigits(value: string): number[] {
    return [...value].map((character) => Number(character));
  }
}
