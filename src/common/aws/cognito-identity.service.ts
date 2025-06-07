// src/common/aws/cognito-identity.service.ts
import { Injectable } from '@nestjs/common';
import {
  CognitoIdentityClient,
  GetIdCommand,
  GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CognitoIdentityService {
  private readonly idp: CognitoIdentityClient;
  private readonly idPoolId: string;
  private readonly cfg: ConfigService;

  constructor(cfg: ConfigService) {
    this.cfg      = cfg;
    this.idp      = new CognitoIdentityClient({ region: this.cfg.get('aws.region') });
    this.idPoolId = this.cfg.get<string>('cognito.identityPoolId')!;
  }

  /** Exchange ID‑token for short‑lived AWS creds */
  async getTempCreds(idToken: string) {
    const getId = await this.idp.send(
      new GetIdCommand({
        IdentityPoolId: this.idPoolId,
        Logins: {
          [`cognito-idp.${this.cfg.get('aws.region')}.amazonaws.com/${this.cfg.get('cognito.userPoolId')}`]:
            idToken,
        },
      }),
    );

    const creds = await this.idp.send(
      new GetCredentialsForIdentityCommand({
        IdentityId: getId.IdentityId!,
        Logins: {
          [`cognito-idp.${this.cfg.get('aws.region')}.amazonaws.com/${this.cfg.get('cognito.userPoolId')}`]:
            idToken,
        },
      }),
    );

    return creds.Credentials!; // {AccessKeyId,SecretKey,SessionToken,Expiration}
  }
}
