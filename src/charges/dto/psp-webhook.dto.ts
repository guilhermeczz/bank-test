import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export type PspWebhookEvent = 'boleto.paid' | 'pix.paid';

export class PspWebhookDto {
  @IsIn(['boleto.paid', 'pix.paid'])
  event!: PspWebhookEvent;

  @ValidateIf((input: PspWebhookDto) => input.event === 'boleto.paid')
  @IsString()
  @IsNotEmpty()
  nossoNumero?: string;

  @ValidateIf((input: PspWebhookDto) => input.event === 'pix.paid')
  @IsString()
  @IsNotEmpty()
  txid?: string;

  @IsInt()
  @Min(1)
  paidAmount!: number;

  @IsISO8601()
  paidAt!: string;

  @ValidateIf((input: PspWebhookDto) => input.event === 'pix.paid')
  @IsString()
  @IsNotEmpty()
  endToEndId?: string;
}
