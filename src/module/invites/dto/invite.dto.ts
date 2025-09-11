import {
  IsEmail,
  IsEnum,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../users/enums/users.enum';
import { InviteStatus } from '../invites.schema';

export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allow?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deny?: string[];
}

export class BulkInviteUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allow?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deny?: string[];
}

export class BulkCreateInviteDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one user must be invited' })
  @ArrayMaxSize(3, { message: 'Maximum 3 users can be invited at once' })
  @ValidateNested({ each: true })
  @Type(() => BulkInviteUserDto)
  users: BulkInviteUserDto[];
}

export class InviteListQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(InviteStatus, { each: true })
  status?: InviteStatus[];
}
