import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type S3Op = 'put' | 'get';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(cfg: ConfigService) {
    this.s3    = new S3Client({ region: cfg.get('aws.region') });
    this.bucket = cfg.get<string>('aws.certBucket')!;
  }

  /** Generic upload wrapper */
  async putObject(
    key   : string,
    body  : Buffer | Uint8Array | string,
    extra : Partial<PutObjectCommandInput> = {},
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key   : key,
        Body  : body,
        ...extra,
      }),
    );
  }

  /** Presign GET / PUT (default GET) */
  async presign(key: string, op: S3Op = 'get', expires = 3_600): Promise<string> {
    const cmd =
      op === 'put'
        ? new PutObjectCommand({ Bucket: this.bucket, Key: key })
        : new GetObjectCommand({ Bucket: this.bucket, Key: key });

    return getSignedUrl(this.s3, cmd, { expiresIn: expires });
  }
}
