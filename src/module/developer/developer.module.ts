import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiToken, ApiTokenSchema } from './schemas/api-token.schema';
import { ApiTokenService } from './api-token.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { DeveloperController } from './developer.controller';
import { DeveloperAuthController } from './developer-auth.controller';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ApiToken.name, schema: ApiTokenSchema },
    ]),
    forwardRef(() => MembershipsModule),
  ],
  controllers: [DeveloperController, DeveloperAuthController],
  providers: [ApiTokenService, ApiKeyAuthGuard],
  exports: [ApiTokenService, ApiKeyAuthGuard],
})
export class DeveloperModule { }
