import {
  AttachPolicyCommand,
  AttachThingPrincipalCommand,
  CertificateStatus,
  CreateKeysAndCertificateCommand,
  CreateThingCommand,
  DeleteCertificateCommand,
  DeleteThingCommand,
  DetachPolicyCommand,
  DetachThingPrincipalCommand,
  IoTClient,
  ListThingPrincipalsCommand,
  UpdateCertificateCommand
} from '@aws-sdk/client-iot';
import { Injectable } from '@nestjs/common';
import * as JSZip from 'jszip';
import { DateTime } from 'luxon';

import { ConfigService } from '@nestjs/config';
import { S3Service } from '../../common/aws/s3.service';

const AMAZON_ROOT_CA_1 = `-----BEGIN CERTIFICATE-----
<… full Amazon Root CA (cut for brevity) …>
-----END CERTIFICATE-----`;

@Injectable()
export class CertsService {
  private readonly iot: IoTClient;
  private readonly tenantPolicy = "GatewayTenantPolicy";   

  constructor(
    private readonly s3Svc: S3Service,
    cfg: ConfigService,
  ) {
    this.iot = new IoTClient({ region: cfg.get('aws.region') });
  }

  /** Factory flow: Thing → certs → ZIP upload → presigned URL */
  async provisionGateway(thingName: string, mac: string) {
    // 1) Create the Thing
    await this.iot.send(
      new CreateThingCommand({
        thingName,
        attributePayload: { attributes: { mac } },
      }),
    );

    // 2) Create a key + cert and mark it Active
    const cert = await this.iot.send(
      new CreateKeysAndCertificateCommand({ setAsActive: true }),
    );

    // 2a) Attach that cert to the Thing
    await this.iot.send(
      new AttachThingPrincipalCommand({
        thingName,
        principal: cert.certificateArn!,
      }),
    );

    // 2b) Attach your tenant policy to the cert
    await this.iot.send(
      new AttachPolicyCommand({
        policyName: this.tenantPolicy,
        target: cert.certificateArn!,
      }),
    );

    /* 3️⃣ Build ZIP buffer */
    const zip = new JSZip();
    zip.file(`${thingName}-cert.pem`, cert.certificatePem!);
    zip.file(`${thingName}.key`, cert.keyPair!.PrivateKey!);
    zip.file('AmazonRootCA1.pem', AMAZON_ROOT_CA_1);
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

    /* 4️⃣ Key name  gateways/<thing>/<timestamp>.zip */
    const ts = DateTime.now().toFormat('yyyyLLddHHmmss');
    const zipKey = `gateways/${thingName}/${ts}.zip`;

    await this.s3Svc.putObject(zipKey, zipBuf, {
      ContentType: 'application/zip',
    });
    const presigned = await this.s3Svc.presign(zipKey);

    return {
      certId: cert.certificateId!,
      certPem: cert.certificatePem!,
      keyPem: cert.keyPair!.PrivateKey!,
      caPem: AMAZON_ROOT_CA_1,
      packS3Key: zipKey,
      download: presigned,
    };
  }

  // src/module/certs/certs.service.ts  (add to class)
  async addFileToPack(zipKey: string, fileName: string, contents: string) {
    const orig = await this.s3Svc.getObjectAsBuffer(zipKey);
    const zip = await JSZip.loadAsync(orig);
    zip.file(fileName, contents);
    const newBuf = await zip.generateAsync({ type: 'nodebuffer' });
    await this.s3Svc.putObject(zipKey, newBuf, {
      ContentType: 'application/zip',
    });
  }

  /** Cleanup gateway resources: certificates, thing, and S3 files */
  async cleanupGateway(thingName: string, certId: string, packS3Key?: string) {
    console.log(`🧹 Starting cleanup for gateway ${thingName} with cert ${certId}`);
    
    try {
      // 1. First, get all principals attached to the thing to find the correct ARN
      let certArn: string | undefined;
      
      try {
        const principals = await this.iot.send(
          new ListThingPrincipalsCommand({ thingName })
        );
        
        // Find the certificate ARN that matches our certId
        certArn = principals.principals?.find(arn => arn.includes(certId));
        
        if (!certArn) {
          console.warn(`Certificate ARN not found for certId ${certId} on thing ${thingName}`);
          // Try to construct the ARN anyway
          const region = process.env.AWS_REGION || 'us-east-1';
          const accountId = process.env.AWS_ACCOUNT_ID;
          if (accountId) {
            certArn = `arn:aws:iot:${region}:${accountId}:cert/${certId}`;
          }
        }
      } catch (error) {
        console.warn(`Failed to list thing principals for ${thingName}:`, error);
        // Continue with manual ARN construction
        const region = process.env.AWS_REGION || 'us-east-1';
        const accountId = process.env.AWS_ACCOUNT_ID;
        if (accountId) {
          certArn = `arn:aws:iot:${region}:${accountId}:cert/${certId}`;
        }
      }

      if (!certArn) {
        console.error(`Cannot determine certificate ARN for ${certId}. Skipping AWS cleanup.`);
      } else {
        console.log(`Using certificate ARN: ${certArn}`);

        // 2. Detach policy from certificate
        try {
          await this.iot.send(
            new DetachPolicyCommand({
              policyName: this.tenantPolicy,
              target: certArn,
            }),
          );
          console.log(`✅ Detached policy ${this.tenantPolicy} from cert ${certId}`);
        } catch (error: any) {
          console.warn(`Failed to detach policy from cert ${certId}:`, error.message);
          // Continue with cleanup even if policy detach fails
        }

        // 3. Detach certificate from thing
        try {
          await this.iot.send(
            new DetachThingPrincipalCommand({
              thingName,
              principal: certArn,
            }),
          );
          console.log(`✅ Detached cert ${certId} from thing ${thingName}`);
        } catch (error: any) {
          console.warn(`Failed to detach cert from thing ${thingName}:`, error.message);
          // Continue with cleanup even if detach fails
        }

        // 4. Deactivate certificate before deletion
        try {
          await this.iot.send(
            new UpdateCertificateCommand({
              certificateId: certId,
              newStatus: CertificateStatus.INACTIVE,
            }),
          );
          console.log(`✅ Deactivated cert ${certId}`);
        } catch (error: any) {
          console.warn(`Failed to deactivate cert ${certId}:`, error.message);
          // Continue even if deactivation fails
        }

        // 5. Delete certificate (only after detaching from all things and policies)
        try {
          await this.iot.send(
            new DeleteCertificateCommand({
              certificateId: certId,
            }),
          );
          console.log(`✅ Deleted cert ${certId}`);
        } catch (error: any) {
          console.warn(`Failed to delete cert ${certId}:`, error.message);
          // Certificate might still be attached to something
        }
      }

      // 6. Delete thing (only after all certificates are detached)
      try {
        await this.iot.send(
          new DeleteThingCommand({
            thingName,
          }),
        );
        console.log(`✅ Deleted thing ${thingName}`);
      } catch (error: any) {
        console.warn(`Failed to delete thing ${thingName}:`, error.message);
        // Thing might still have certificates attached
      }

      // 7. Delete S3 certificate pack (this should always work)
      if (packS3Key) {
        try {
          await this.s3Svc.deleteObject(packS3Key);
          console.log(`✅ Deleted S3 object ${packS3Key}`);
        } catch (error: any) {
          console.warn(`Failed to delete S3 object ${packS3Key}:`, error.message);
        }
      }

      console.log(`🎉 Cleanup completed for gateway ${thingName}`);

    } catch (error) {
      console.error(`❌ Error during gateway cleanup for ${thingName}:`, error);
      // Don't throw - we want cleanup to be non-blocking
    }
  }
}
