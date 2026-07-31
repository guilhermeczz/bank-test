import {
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export type PspWebhookEvent = 'boleto.paid' | 'pix.paid' | 'pix.expired';

export class PspWebhookDto {
  @IsIn(['boleto.paid', 'pix.paid', 'pix.expired'])
  event!: PspWebhookEvent;

  @ValidateIf((input: PspWebhookDto) => input.event === 'boleto.paid')
  @IsString()
  @IsNotEmpty()
  nossoNumero?: string;

  @ValidateIf(
    (input: PspWebhookDto) =>
      input.event === 'pix.paid' || input.event === 'pix.expired',
  )
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  txid?: string;

  @ValidateIf(
    (input: PspWebhookDto) =>
      input.event === 'boleto.paid' || input.event === 'pix.paid',
  )
  @IsDefined()
  @IsInt()
  @Min(1)
  paidAmount?: number;

  @ValidateIf(
    (input: PspWebhookDto) =>
      input.event === 'boleto.paid' || input.event === 'pix.paid',
  )
  @IsDefined()
  @IsISO8601()
  paidAt?: string;

  @ValidateIf((input: PspWebhookDto) => input.event === 'pix.paid')
  @IsString()
  @IsNotEmpty()
  endToEndId?: string;

  // O payload assumido para `pix.expired` informa o instante de expiração
  // observado pelo PSP; essa premissa será documentada posteriormente.
  @ValidateIf((input: PspWebhookDto) => input.event === 'pix.expired')
  @IsDefined()
  @IsISO8601()
  expiredAt?: string;
}
