import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
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
