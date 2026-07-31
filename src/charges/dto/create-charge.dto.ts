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

// O DTO valida o formato HTTP; regras financeiras ficam no domínio e `amount` é centavos.
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
