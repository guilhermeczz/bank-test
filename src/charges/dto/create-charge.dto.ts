import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

import type { PaymentMethod } from '../../domain/payment-method';

/**
 * Valida o formato dos dados do pagador recebidos pela API. As regras próprias
 * de CPF e CNPJ continuam protegidas por `PayerDocument` no domínio.
 */
export class PayerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  document!: string;

  @IsEmail()
  email!: string;
}

/**
 * Define e valida o formato da requisição HTTP. O DTO verifica tipos e campos
 * obrigatórios, enquanto o domínio continua responsável pelas regras financeiras.
 * Na API o campo se chama `amount`, mas seu valor representa centavos inteiros.
 */
export class CreateChargeDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PayerDto)
  payer!: PayerDto;

  @IsInt()
  amount!: number;

  @IsString()
  dueDate!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsIn(['BOLETO', 'PIX'])
  paymentMethod!: PaymentMethod;
}
