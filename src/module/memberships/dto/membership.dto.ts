import {
  IsEnum,
  IsArray,
  IsOptional,
  IsString,
  IsMongoId,
  IsIn,
} from 'class-validator';
import { UserRole } from '../../users/enums/users.enum';
import { ALL_PERMISSIONS } from '../../../common/constants/permissions';

export class UpdateMembershipRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateMembershipPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'Invalid permission provided' })
  allow: string[];

  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'Invalid permission provided' })
  deny: string[];
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'Invalid permission provided' })
  allow?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSIONS, { each: true, message: 'Invalid permission provided' })
  deny?: string[];
}

export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  dir?: 'asc' | 'desc';
}
