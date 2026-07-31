import { PayerDocumentValidationError } from './domain-error';

/** Identifica os dois tipos de documento aceitos nesta versão do domínio. */
export type PayerDocumentType = 'CPF' | 'CNPJ';

/**
 * Representa um CPF ou CNPJ válido por meio do seu valor, e não por uma identidade
 * própria. Por isso, `PayerDocument` é uma classe de valor: sua finalidade é
 * validar e carregar um documento normalizado de maneira consistente.
 */
export class PayerDocument {
  /**
   * O valor fica privado para não ser substituído sem validação. `readonly`
   * também impede que a própria classe o reatribua depois do construtor.
   */
  private readonly normalizedValue: string;

  /** O tipo é calculado uma vez pelo tamanho do valor normalizado. */
  private readonly documentType: PayerDocumentType;

  /**
   * O construtor normaliza, identifica e valida antes de armazenar o documento.
   * Assim, toda instância criada com sucesso representa necessariamente um CPF
   * ou CNPJ aceito pelas regras atuais.
   */
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

  /** Retorna sempre o CPF ou CNPJ somente com números. */
  get value(): string {
    return this.normalizedValue;
  }

  /** Expõe o tipo identificado sem permitir que ele seja alterado. */
  get type(): PayerDocumentType {
    return this.documentType;
  }

  /**
   * Normalização é a conversão de diferentes formatos equivalentes para uma
   * representação única. Pontos, traço e barra são removidos para armazenar e
   * comparar documentos somente pelos seus dígitos.
   *
   * A entrada é verificada antes da remoção. Dessa forma, letras ou símbolos
   * inesperados não desaparecem silenciosamente e continuam sendo rejeitados.
   */
  private normalize(value: string): string {
    if (value.length === 0) {
      throw new PayerDocumentValidationError('Payer document cannot be empty.');
    }

    if (!/^[0-9.\-/]+$/.test(value)) {
      throw new PayerDocumentValidationError(
        'Payer document contains unsupported characters.',
      );
    }

    return value.replace(/[.\-/]/g, '');
  }

  /**
   * Após a normalização, o tamanho elimina ambiguidades: 11 dígitos representam
   * CPF e 14 representam CNPJ. Qualquer outro tamanho é inválido nesta etapa.
   */
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

  /**
   * Sequências com um único dígito repetido não representam documentos válidos,
   * mesmo quando alguma operação matemática pudesse coincidir com os últimos
   * dígitos. Essa regra é verificada antes dos cálculos específicos.
   */
  private ensureDigitsAreNotRepeated(value: string): void {
    if (/^(\d)\1+$/.test(value)) {
      throw new PayerDocumentValidationError(
        'Payer document cannot contain only repeated digits.',
      );
    }
  }

  /**
   * No CPF, os nove primeiros dígitos formam a base. O primeiro verificador usa
   * pesos decrescentes de 10 a 2; o segundo inclui o dígito recém-calculado e usa
   * pesos de 11 a 2. O documento só é válido quando ambos coincidem com a entrada.
   */
  private isValidCpf(value: string): boolean {
    const digits = this.toDigits(value);
    const firstCheckDigit = this.calculateCpfCheckDigit(digits.slice(0, 9), 10);
    const secondCheckDigit = this.calculateCpfCheckDigit(
      [...digits.slice(0, 9), firstCheckDigit],
      11,
    );

    return firstCheckDigit === digits[9] && secondCheckDigit === digits[10];
  }

  /** Calcula um dígito do CPF aplicando os pesos decrescentes da etapa atual. */
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

  /**
   * No CNPJ, os doze dígitos da base são combinados com uma primeira sequência
   * de pesos. O resultado entra na base do segundo cálculo, que usa outra
   * sequência. Os dois resultados devem coincidir com os dígitos informados.
   */
  private isValidCnpj(value: string): boolean {
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

  /** Calcula um dígito do CNPJ usando a sequência de pesos correspondente. */
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

  /**
   * Converte a string validada em números para que os cálculos possam ser feitos.
   * O método privado mantém esse detalhe interno e evita repetir a conversão.
   */
  private toDigits(value: string): number[] {
    return [...value].map((character) => Number(character));
  }
}
