import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';

export type S3Op = 'put' | 'get';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(cfg: ConfigService) {
    this.s3 = new S3Client({ region: cfg.get('aws.region') });
    this.bucket = cfg.get<string>('aws.certBucket')!;
  }

  /** Generic upload wrapper */
  async putObject(
    key: string,
    body: Buffer | Uint8Array | string,
    extra: Partial<PutObjectCommandInput> = {},
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ...extra,
      }),
    );
  }

  /** Presign GET / PUT (default GET) */
  async presign(
    key: string,
    op: S3Op = 'get',
    expires = 3_600,
  ): Promise<string> {
    const cmd =
      op === 'put'
        ? new PutObjectCommand({ Bucket: this.bucket, Key: key })
        : new GetObjectCommand({ Bucket: this.bucket, Key: key });

    return getSignedUrl(this.s3, cmd, { expiresIn: expires });
  }

  /** Download an object and return it as Buffer (used to patch ZIP) */
  async getObjectAsBuffer(key: string): Promise<Buffer> {
    const { Body } = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!(Body instanceof Readable))
      throw new Error('Unexpected S3 Body type');
    return this.streamToBuffer(Body);
  }

  /** tiny helper – S3 stream ➜ Buffer */
  async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  /** Delete an object from S3 */
  async deleteObject(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}
