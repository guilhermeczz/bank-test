export class ChargeStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChargeStateError';
  }
}

export class ChargeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChargeValidationError';
  }
}

export class PayerDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayerDocumentValidationError';
  }
}
