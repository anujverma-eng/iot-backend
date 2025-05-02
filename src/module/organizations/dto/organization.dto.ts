import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateOrganizationDto {
  @IsString() name: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsMongoId() planId: string;
}

export class UpdateOrganizationDto extends CreateOrganizationDto {}
