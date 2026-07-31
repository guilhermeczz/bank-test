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
        throw new NotFoundException(error.message);
      }

      if (error instanceof PaymentAmountMismatchError) {
        throw new UnprocessableEntityException(error.message);
      }

      if (error instanceof InvalidPixExpirationEventError) {
        throw new UnprocessableEntityException(error.message);
      }

      if (error instanceof ChargeStateError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}
