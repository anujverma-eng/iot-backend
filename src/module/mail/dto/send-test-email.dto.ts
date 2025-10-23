import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';

export class SendTestEmailDto {
  @IsEmail()
  to: string;

  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  htmlBody: string;

  @IsOptional()
  @IsString()
  textBody?: string;
}