import { Module } from '@nestjs/common';
import { S3Module } from '../../common/aws/s3.module';
import { CertsService } from './certs.service';

@Module({
  imports   : [S3Module],
  providers : [CertsService],
  exports   : [CertsService],
})
export class CertsModule {}
