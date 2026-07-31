import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import type { ChargeStatus } from '../../domain/charge-status';

export class ListChargesQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'])
  status?: ChargeStatus;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  payerDocument?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
