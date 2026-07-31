import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';

import { ChargeStateError } from '../domain/domain-error';
import { PspWebhookDto } from './dto/psp-webhook.dto';
import {
  InvalidPixExpirationEventError,
  PaymentAmountMismatchError,
  PaymentReferenceNotFoundError,
  PspWebhooksService,
} from './psp-webhooks.service';

@Controller('webhooks')
export class PspWebhooksController {
  constructor(private readonly pspWebhooksService: PspWebhooksService) {}

  @Post('psp')
  @HttpCode(HttpStatus.OK)
  process(@Body() input: PspWebhookDto) {
    try {
      return this.pspWebhooksService.process(input);
    } catch (error: unknown) {
      if (error instanceof PaymentReferenceNotFoundError) {
        // A referência externa não corresponde a uma cobrança conhecida.
        throw new NotFoundException(error.message);
      }

      if (error instanceof PaymentAmountMismatchError) {
        // O payload é válido, mas seu valor não pode ser processado.
        throw new UnprocessableEntityException(error.message);
      }

      if (error instanceof InvalidPixExpirationEventError) {
        throw new UnprocessableEntityException(error.message);
      }

      if (error instanceof ChargeStateError) {
        // A cobrança existe, porém seu estado entra em conflito com o pagamento.
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}
