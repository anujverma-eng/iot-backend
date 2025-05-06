import { Injectable } from '@nestjs/common';
import {
  IoTClient,
  CreateKeysAndCertificateCommand,
  CreateThingCommand,
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

  constructor(
    private readonly s3Svc: S3Service,
    cfg: ConfigService,
  ) {
    this.iot = new IoTClient({ region: cfg.get('aws.region') });
  }

  /** Factory flow: Thing → certs → ZIP upload → presigned URL */
  async provisionGateway(thingName: string, mac: string) {
    /* 1️⃣ Thing */
    await this.iot.send(
      new CreateThingCommand({
        thingName,
        attributePayload: { attributes: { mac } },
      }),
    );

    /* 2️⃣ Cert / key */
    const cert = await this.iot.send(
      new CreateKeysAndCertificateCommand({ setAsActive: true }),
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
}
