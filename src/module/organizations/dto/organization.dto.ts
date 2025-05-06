import { IsMongoId, IsOptional, IsString, Length } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 60)
  name: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsMongoId()
  planId?: string;
}

export class UpdateOrganizationDto extends CreateOrganizationDto {}
