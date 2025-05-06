import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMACAddress,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
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

  @IsString()
  @Length(6, 6)
  claimCode!: string;
}

export class AdminCreateGatewayDto {
  /** Factory‑printed MAC on the sticker */
  @IsMACAddress() mac!: string;

  /** Optional human label shown in dashboard before claim */
  @IsOptional() @IsString()
  label?: string;
}


export class CreateGatewayAdminDto {
  @IsMACAddress() mac!: string;
}

export class BulkGatewaysDto {
  /** 1‑10 MAC addresses per call */
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsMACAddress(undefined, { each: true })
  macs!: string[];
}