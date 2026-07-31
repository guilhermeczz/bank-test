import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import type { Charge } from '../domain/charge';
import {
  ChargeStateError,
  ChargeValidationError,
  PayerDocumentValidationError,
} from '../domain/domain-error';
import { CreateChargeDto } from './dto/create-charge.dto';
import { ListChargesQueryDto } from './dto/list-charges-query.dto';
import {
  ChargeNotFoundError,
  ChargesService,
  IdempotencyConflictError,
  InvalidIdempotencyKeyError,
  PaymentProviderError,
} from './charges.service';

@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Post()
  async create(
    @Body() input: CreateChargeDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    try {
      const charge = await this.chargesService.create(input, idempotencyKey);

      return this.toResponse(charge);
    } catch (error: unknown) {
      this.handleKnownError(error);
    }
  }

  @Get()
  list(@Query() query: ListChargesQueryDto) {
    try {
      const result = this.chargesService.list(query);

      return {
        items: result.items.map((charge) => this.toResponse(charge)),
        page: result.page,
        limit: result.limit,
        total: result.total,
      };
    } catch (error: unknown) {
      this.handleKnownError(error);
    }
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    try {
      return this.toResponse(this.chargesService.findById(id));
    } catch (error: unknown) {
      this.handleKnownError(error);
    }
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    try {
      return this.toResponse(this.chargesService.cancel(id));
    } catch (error: unknown) {
      this.handleKnownError(error);
    }
  }

  private toResponse(charge: Charge) {
    // O mapeamento explícito separa o contrato HTTP da estrutura interna da entidade.
    return {
      id: charge.id,
      status: charge.status,
      payer: {
        name: charge.payer.name,
        document: charge.payer.document.value,
        email: charge.payer.email,
      },
      amount: charge.amountInCents,
      dueDate: charge.dueDate,
      description: charge.description,
      paymentMethod: charge.paymentMethod,
      paymentInstrument: charge.paymentInstrument,
    };
  }

  private handleKnownError(error: unknown): never {
    if (
      error instanceof ChargeValidationError ||
      error instanceof PayerDocumentValidationError ||
      error instanceof InvalidIdempotencyKeyError
    ) {
      throw new BadRequestException(error.message);
    }

    if (error instanceof PaymentProviderError) {
      throw new BadGatewayException(error.message);
    }

    if (error instanceof ChargeNotFoundError) {
      throw new NotFoundException(error.message);
    }

    if (error instanceof ChargeStateError) {
      throw new ConflictException(error.message);
    }

    if (error instanceof IdempotencyConflictError) {
      throw new ConflictException(error.message);
    }

    throw error;
  }
}
