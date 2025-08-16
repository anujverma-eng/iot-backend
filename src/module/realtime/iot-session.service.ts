import { BadRequestException, Injectable } from '@nestjs/common';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import {
  IoTClient,
  DescribeEndpointCommand,
  ListAttachedPoliciesCommand,
  AttachPolicyCommand,
} from '@aws-sdk/client-iot';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityClient,
  GetIdCommand,
} from '@aws-sdk/client-cognito-identity';

@Injectable()
export class IotSessionService {
  private sts: STSClient;
  private iot: IoTClient;
  private viewerRoleArn: string;
  private region: string;
  private accountId: string;
  private identityPoolId: string;
  private userPoolId: string;
  private iotPolicyName: string;
  private cognito: CognitoIdentityClient;

  constructor(private readonly cfg: ConfigService) {
    this.region = this.cfg.get<string>('aws.region') || 'us-east-1';
    this.identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!; // us-east-1:cbd9532f-...
    this.userPoolId = process.env.COGNITO_USER_POOL_ID!; // us-east-1_VAsPtXbFn
    this.iotPolicyName =
      process.env.IOT_BROWSER_POLICY || 'AmplifyBrowserGwWildcard';

    this.cognito = new CognitoIdentityClient({ region: this.region });

    this.sts = new STSClient({ region: this.region });
    this.iot = new IoTClient({ region: this.region });

    // Get the viewer role ARN from environment or use the fallback
    this.viewerRoleArn =
      this.cfg.get<string>('aws.iotViewerRoleArn') ||
      'arn:aws:iam::199472244724:role/IoTRealtimeViewerRole';

    // Extract account ID from the role ARN
    const arnParts = this.viewerRoleArn.split(':');
    this.accountId = arnParts[4] || '199472244724';
  }

  /** Build a tight, read‑only session policy for specific gateway topics */
  private buildSessionPolicy(gatewayIds: string[]) {
    const topicArns: string[] = [];
    const topicFilterArns: string[] = [];
    const presenceTopicArns: string[] = [];
    const presenceTopicFilterArns: string[] = [];

    for (const gw of gatewayIds) {
      const safe = gw.trim();
      // Regular data topics
      topicArns.push(
        `arn:aws:iot:${this.region}:${this.accountId}:topic/${safe}/data`,
      );
      topicFilterArns.push(
        `arn:aws:iot:${this.region}:${this.accountId}:topicfilter/${safe}/data`,
      );

      // Presence topics (connected/disconnected status)
      presenceTopicArns.push(
        `arn:aws:iot:${this.region}:${this.accountId}:topic/$aws/events/presence/+/${safe}`,
      );
      presenceTopicFilterArns.push(
        `arn:aws:iot:${this.region}:${this.accountId}:topicfilter/$aws/events/presence/+/${safe}`,
      );
    }

    return JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'Connect',
          Effect: 'Allow',
          Action: ['iot:Connect'],
          Resource: '*',
        },
        {
          Sid: 'SubscribeReceiveExactGateways',
          Effect: 'Allow',
          Action: ['iot:Subscribe', 'iot:Receive'],
          Resource: [
            ...topicArns,
            ...topicFilterArns,
            ...presenceTopicArns,
            ...presenceTopicFilterArns,
          ],
        },
      ],
    });
  }

  /** Mint short‑lived credentials + return IoT endpoint and allowed topics */
  async getViewerSession(gatewayIds: string[], durationSeconds = 3600) {
    if (!gatewayIds?.length) throw new Error('No gatewayIds provided');

    // 1) IoT ATS endpoint (WSS uses the same hostname)
    const { endpointAddress } = await this.iot.send(
      new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }),
    );
    if (!endpointAddress) throw new Error('Could not resolve IoT endpoint');

    // 2) Assume the viewer role with a per-user session policy
    const SessionPolicy = this.buildSessionPolicy(gatewayIds);
    const assume = await this.sts.send(
      new AssumeRoleCommand({
        RoleArn: this.viewerRoleArn,
        RoleSessionName: `viewer-${Date.now()}`,
        DurationSeconds: durationSeconds,
        Policy: SessionPolicy,
      }),
    );
    if (!assume.Credentials) throw new Error('No credentials from STS');

    return {
      endpoint: endpointAddress,
      region: this.region,
      credentials: {
        accessKeyId: assume.Credentials.AccessKeyId!,
        secretAccessKey: assume.Credentials.SecretAccessKey!,
        sessionToken: assume.Credentials.SessionToken!,
        expiration:
          assume.Credentials.Expiration!.toISOString?.() ||
          String(assume.Credentials.Expiration),
      },
      topics: gatewayIds.map((gw) => `${gw}/data`),
      presenceTopics: gatewayIds.map((gw) => `$aws/events/presence/+/${gw}`),
    };
  }

  async ensureIotPolicyAttached(idToken: string) {
    if (!idToken) throw new BadRequestException('Missing ID token');

    // 1) Derive (or create) the Cognito Identity ID from the User Pool token
    const provider = `cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;
    const getId = await this.cognito.send(
      new GetIdCommand({
        IdentityPoolId: this.identityPoolId,
        Logins: { [provider]: idToken },
      }),
    );
    const identityId = getId.IdentityId;
    if (!identityId)
      throw new BadRequestException('Could not resolve Cognito Identity ID');

    // 2) Check if policy already attached
    const listed = await this.iot.send(
      new ListAttachedPoliciesCommand({ target: identityId, pageSize: 200 }),
    );
    const already = (listed.policies || []).some(
      (p) => p.policyName === this.iotPolicyName,
    );

    // 3) Attach if missing (idempotent)
    if (!already) {
      await this.iot.send(
        new AttachPolicyCommand({
          policyName: this.iotPolicyName,
          target: identityId,
        }),
      );
    }

    return {
      identityId,
      policyName: this.iotPolicyName,
      attached: true,
      alreadyAttached: already,
    };
  }
}
