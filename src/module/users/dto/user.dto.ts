import {
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole, UserStatus } from '../enums/users.enum';

export class CreateUserDto {
  @IsMongoId()
  orgId: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsString()
  cognitoSub: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsEnum(UserStatus)
  status: UserStatus;
}

export class UpdateUserDto extends CreateUserDto {}
