import { IsEmail, IsString, MinLength } from 'class-validator';

export class SigninDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
