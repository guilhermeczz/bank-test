/**
 * Este arquivo define o erro usado quando uma operação viola as regras de estado
 * de uma cobrança. Um erro específico permite que as camadas futuras distingam
 * uma regra de negócio inválida de falhas técnicas, como indisponibilidade de rede.
 */

/**
 * Representa uma tentativa de transição de estado que o domínio não permite.
 *
 * `extends Error` significa que a classe herda o comportamento padrão dos erros
 * do JavaScript, incluindo mensagem e stack trace. Ao mesmo tempo, sua classe e
 * seu `name` próprios permitem identificá-la como uma violação da entidade Charge.
 */
export class ChargeStateError extends Error {
  /**
   * O construtor prepara uma nova instância do erro. `super(message)` chama o
   * construtor de `Error`, que armazena corretamente a mensagem recebida.
   */
  constructor(message: string) {
    super(message);
    this.name = 'ChargeStateError';
  }
}

/**
 * Representa dados inválidos fornecidos para criar uma cobrança.
 * Esta classe separa falhas de validação, como um valor fora dos limites, de
 * `ChargeStateError`, que representa uma transição proibida em entidade existente.
 */
export class ChargeValidationError extends Error {
  /** Inicializa o erro padrão e fornece um nome específico para identificação. */
  constructor(message: string) {
    super(message);
    this.name = 'ChargeValidationError';
  }
}

/**
 * Representa um CPF ou CNPJ que não atende às regras de formato ou aos cálculos
 * dos dígitos verificadores. Um erro próprio permite distinguir essa validação
 * das regras de valor e das transições de estado da cobrança.
 */
export class PayerDocumentValidationError extends Error {
  /** Inicializa o erro padrão e define um nome específico para identificação. */
  constructor(message: string) {
    super(message);
    this.name = 'PayerDocumentValidationError';
  }
}
