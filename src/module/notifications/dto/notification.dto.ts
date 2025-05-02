import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { NotificationKind } from '../enums/notification.enum';

export class CreateNotificationDto {
  @IsMongoId()
  orgId: string;

  @IsOptional()
  @IsMongoId()
  recipientUserId?: string;   // optional

  @IsEnum(NotificationKind)
  kind: NotificationKind;

  @IsString()
  message: string;

  @IsOptional()
  @IsBoolean()
  read?: boolean;             // default handled by schema
}

export class UpdateNotificationDto extends CreateNotificationDto {}
