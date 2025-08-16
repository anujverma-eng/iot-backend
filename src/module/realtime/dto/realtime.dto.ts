import { IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

export class IotCredsDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  gatewayIds: string[];

  @IsOptional()
  @IsNumber()
  @Min(900)
  @Max(3600)
  durationSeconds?: number;
}
