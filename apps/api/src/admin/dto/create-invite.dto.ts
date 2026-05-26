import { IsOptional, IsInt, Min, Max, IsDateString, IsString, MaxLength } from 'class-validator';

export class CreateInviteDto {
  /** Number of codes to generate in one call (1–20). Defaults to 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;

  /** ISO-8601 datetime after which the code expires. Omit for no expiry. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  /** Free-text note for admin reference (e.g. "For Alice's cousin"). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
