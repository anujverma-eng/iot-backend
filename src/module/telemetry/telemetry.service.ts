// src/module/telemetry/telemetry.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Telemetry, TelemetryDocument } from './telemetry.schema';
import { Model, PipelineStage } from 'mongoose';
import { Bucket } from './enum/telemetry.enum';
// import ms from 'ms';
import * as ms from 'ms';     
import type { StringValue } from 'ms';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectModel(Telemetry.name)
    private readonly telModel: Model<TelemetryDocument>,
  ) {}

  async findBySensor(
    sensorId: string,
    opts: { from?: Date; to?: Date; limit: number },
  ) {
    const q: any = { sensorId };
    if (opts.from || opts.to) q.ts = {};
    if (opts.from) q.ts.$gte = opts.from;
    if (opts.to) q.ts.$lte = opts.to;

    return this.telModel
      .find(q, { _id: 0, __v: 0, sensorId: 0 })
      .sort({ ts: -1 })
      .limit(opts.limit)
      .lean();
  }

  private toTrunc(b: Bucket) {
    switch (b) {
      case Bucket.MIN1:
        return { unit: 'minute', binSize: 1 };
      case Bucket.MIN5:
        return { unit: 'minute', binSize: 5 };
      case Bucket.HOUR:
        return { unit: 'hour', binSize: 1 };
      case Bucket.DAY:
        return { unit: 'day', binSize: 1 };
      default:
        return null; // RAW
    }
  }

  async querySeries(opts: {
    sensorIds: string[];
    from: Date;
    to: Date;
    bucket?: StringValue;
  }) {
    const match = {
      sensorId: { $in: opts.sensorIds },
      ts: { $gte: opts.from, $lte: opts.to },
    };

    console.log('opts', opts);
    console.log('querySeries', match);
    /* raw – no bucketSize => just sorted data */
    if (!opts.bucket) {
      return this.telModel
        .find(match, { _id: 0, sensorId: 1, ts: 1, value: 1 })
        .sort({ ts: 1 })
        .lean();
    }

    /* convert "15m", "1h" … to minutes / hours / days  */
    if (opts.bucket) {
      const msSize = ms(opts.bucket);
      if (!msSize) throw new BadRequestException('Invalid bucketSize');
      // e.g. 900000
      const unit =
        msSize % 3600000 === 0
          ? 'hour'
          : msSize % 60000 === 0
            ? 'minute'
            : 'second';
      const bin = Math.round(
        msSize / { second: 1_000, minute: 60_000, hour: 3_600_000 }[unit],
      );

      const pipe: PipelineStage[] = [
        { $match: match },
        {
          $set: {
            bucket: {
              $dateTrunc: { date: '$ts', unit, binSize: bin, timezone: 'UTC' },
            },
          },
        },
        {
          $group: {
            _id: { sensor: '$sensorId', bucket: '$bucket' },
            value: { $avg: '$value' }, // centre line
          },
        },
        { $sort: { '_id.bucket': 1 } },
        {
          $project: {
            _id: 0,
            sensorId: '$_id.sensor',
            ts: '$_id.bucket',
            value: 1,
          },
        },
      ];

      console.log('pipe', JSON.stringify(pipe, null, 2));
      return this.telModel.aggregate(pipe).exec();
    }
  }

  /** Core bucketed query used by controller & future jobs */
  async aggregate(opts: {
    sensorIds: string[];
    from: Date;
    to: Date;
    bucket: Bucket;
  }) {
    const match: any = {
      sensorId: { $in: opts.sensorIds },
      ts: { $gte: opts.from, $lte: opts.to },
    };

    const trunc = this.toTrunc(opts.bucket);
    if (!trunc) {
      return this.telModel
        .find(match, { _id: 0, __v: 0 })
        .sort({ ts: 1 })
        .limit(10_000)
        .lean();
    }

    const pipe: PipelineStage[] = [
      { $match: match },
      {
        $set: {
          bucket: {
            $dateTrunc: {
              date: '$ts',
              unit: trunc.unit,
              binSize: trunc.binSize,
              timezone: 'UTC',
            },
          },
        },
      },
      {
        $group: {
          _id: { sensor: '$sensorId', bucket: '$bucket' },
          avg: { $avg: '$value' },
          min: { $min: '$value' },
          max: { $max: '$value' },
        },
      },
      { $sort: { '_id.bucket': 1 } },
      {
        $project: {
          _id: 0,
          sensorId: '$_id.sensor',
          ts: '$_id.bucket',
          avg: 1,
          min: 1,
          max: 1,
        },
      },
    ];

    return this.telModel.aggregate(pipe).exec();
  }
}
