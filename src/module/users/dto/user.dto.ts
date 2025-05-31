import {
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole, UserStatus } from '../enums/users.enum';
import { Expose, Transform } from 'class-transformer';

export class CreateUserDto {
  @IsMongoId()
  orgId: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()         // was @IsString() (required)
  @IsString()
  cognitoSub?: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsEnum(UserStatus)
  status: UserStatus;
}

export class UpdateUserDto extends CreateUserDto {}


export class InviteUserDto {
  @IsEmail()
  email: string;

  /** Optional role override (member by default) */
  @IsOptional()
  @IsEnum(UserRole)
  role: UserRole = UserRole.MEMBER;
}

export class MeDto {
  @Expose() _id: string;
  @Expose() email: string;
  @Expose() role: string;
  @Expose() orgId?: string | null;

  @Transform(() => undefined, { toPlainOnly: true })
  __v?: never;
  @Transform(() => undefined, { toPlainOnly: true })
  createdAt?: never;
  @Transform(() => undefined, { toPlainOnly: true })
  updatedAt?: never;
}