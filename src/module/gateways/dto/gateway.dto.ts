import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { GatewayStatus } from '../enums/gateway.enum';

export class CreateGatewayDto {
  @IsString()
  _id: string; // gatewayId / ThingName

  @IsString()
  mac: string;

  @IsOptional()
  @IsMongoId()
  orgId?: string;

  @IsString()
  certId: string;

  @IsEnum(GatewayStatus)
  status: GatewayStatus;

  // optional fields
  @IsOptional()
  @IsString()
  claimCode?: string;

  @IsOptional()
  @IsString()
  firmwareVersion?: string;
}

export class UpdateGatewayDto extends CreateGatewayDto {}

/** Accepts a printed claim‑ID, which is the gatewayId / ThingName */
export class ClaimGatewayDto {
  @IsString()
  @Matches(/^gw_[A-Za-z0-9]+$/, {
    message: 'claimId must look like gw_<alphanum>',
  })
  claimId!: string;
}