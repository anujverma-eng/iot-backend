import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsMACAddress,
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

  @IsOptional()
  @IsString()
  firmwareVersion?: string;
}

export class UpdateGatewayDto extends CreateGatewayDto {}

export class AdminCreateGatewayDto {
  /** Factory‑printed MAC on the sticker */
  @IsMACAddress() mac!: string;

  /** Optional human label shown in dashboard before claim */
  @IsOptional()
  @IsString()
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

export class RegisterGatewayDto {
  /** Factory-printed MAC on sticker */
  @Matches(/^([0-9A-F]{2}:){3,5}[0-9A-F]{2}$/i, {
    message: 'mac must be 4-octet or 6-octet colon-separated hex',
  })
  mac!: string;

  /** Optional human-friendly label shown in dashboard before first ping */
  @IsOptional()
  @IsString()
  label?: string;
}
