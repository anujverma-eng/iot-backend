import { IsOptional, IsString } from 'class-validator';

export class CreateRogueGatewayDto {
  @IsString()
  _id: string;          // attempted ThingName

  @IsString()
  mac: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateRogueGatewayDto extends CreateRogueGatewayDto {}
