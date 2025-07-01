import { Injectable } from '@nestjs/common';
import {
  IoTClient,
  CreateKeysAndCertificateCommand,
  CreateThingCommand,
  AttachThingPrincipalCommand,
  AttachPolicyCommand,
  DetachThingPrincipalCommand,
  DetachPolicyCommand,
  UpdateCertificateCommand,
  DeleteCertificateCommand,
  DeleteThingCommand,
  CertificateStatus,
} from '@aws-sdk/client-iot';
import { randomUUID } from 'node:crypto';
import * as JSZip from 'jszip';
import { DateTime } from 'luxon';

import { S3Service } from '../../common/aws/s3.service';
import { ConfigService } from '@nestjs/config';

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
    zip.file(`${thingName}-certificate.pem`, cert.certificatePem!);
    zip.file(`${thingName}-private.key`, cert.keyPair!.PrivateKey!);
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
    try {
      // 1. Get certificate ARN (needed for detaching)
      const certArn = `arn:aws:iot:${process.env.AWS_REGION || 'us-east-1'}:${process.env.AWS_ACCOUNT_ID}:cert/${certId}`;

      // 2. Detach policy from certificate
      try {
        await this.iot.send(
          new DetachPolicyCommand({
            policyName: this.tenantPolicy,
            target: certArn,
          }),
        );
      } catch (error) {
        console.warn(`Failed to detach policy from cert ${certId}:`, error);
      }

      // 3. Detach certificate from thing
      try {
        await this.iot.send(
          new DetachThingPrincipalCommand({
            thingName,
            principal: certArn,
          }),
        );
      } catch (error) {
        console.warn(`Failed to detach cert from thing ${thingName}:`, error);
      }

      // 4. Deactivate certificate
      try {
        await this.iot.send(
          new UpdateCertificateCommand({
            certificateId: certId,
            newStatus: CertificateStatus.INACTIVE,
          }),
        );
      } catch (error) {
        console.warn(`Failed to deactivate cert ${certId}:`, error);
      }

      // 5. Delete certificate
      try {
        await this.iot.send(
          new DeleteCertificateCommand({
            certificateId: certId,
          }),
        );
      } catch (error) {
        console.warn(`Failed to delete cert ${certId}:`, error);
      }

      // 6. Delete thing
      try {
        await this.iot.send(
          new DeleteThingCommand({
            thingName,
          }),
        );
      } catch (error) {
        console.warn(`Failed to delete thing ${thingName}:`, error);
      }

      // 7. Delete S3 certificate pack
      if (packS3Key) {
        try {
          await this.s3Svc.deleteObject(packS3Key);
        } catch (error) {
          console.warn(`Failed to delete S3 object ${packS3Key}:`, error);
        }
      }

    } catch (error) {
      console.error(`Error during gateway cleanup for ${thingName}:`, error);
      throw error;
    }
  }
}
