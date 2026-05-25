import { IsEmail, IsString, Length, MinLength, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;
}

export class ConfirmForgotPasswordDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'Confirmation code must be 6 characters' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100)
  newPassword!: string;
}
