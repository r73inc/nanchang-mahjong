import { IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';

export class CreateInviteDto {
  /** ISO-8601 datetime after which the code can no longer be redeemed. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /** Admin-only free-text memo (e.g. the invitee's name). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
