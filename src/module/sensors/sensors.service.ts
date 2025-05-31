import { InjectModel } from '@nestjs/mongoose';
import { Gateway, GatewayDocument } from '../gateways/gateways.schema';
import { Types, Model } from 'mongoose';
import { Sensor, SensorDocument } from './sensors.schema';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../users/enums/users.enum';
import { ClaimSensorDto } from './dto/sensor.dto';

@Injectable()
export class SensorsService {
  constructor(
    @InjectModel(Sensor.name)
    private readonly sensorModel: Model<SensorDocument>,
    @InjectModel(Gateway.name) private readonly gwModel: Model<GatewayDocument>,
  ) {}

  async getMeta(ids: string[]) {
  const docs = await this.sensorModel.find({ _id: { $in: ids } }, { mac:1, type:1, unit:1 }).lean();
  return Object.fromEntries(docs.map(d => [d._id, d]));
}

  /** Return sensors for a gateway, scoped to caller’s org */
  async paginateByGateway(
    gatewayId: string,
    callerOrg: Types.ObjectId,
    { page, limit, claimed }: { page: number; limit: number; claimed?: string },
  ) {
    // reuse the ownership check once
    (await this.gwModel.exists({ _id: gatewayId, orgId: callerOrg })) ||
      (() => {
        throw new NotFoundException('Gateway not found in your org');
      })();

    const base = {
      lastSeenBy: gatewayId,
      ignored: { $ne: true },
      $or: [
        { orgId: callerOrg }, // claimed by my org
        { orgId: null }, // unclaimed but seen by my gw
      ],
    };

    if (claimed !== undefined) base['claimed'] = claimed === 'true';

    const total = await this.sensorModel.countDocuments(base);
    const rows = await this.sensorModel
      .find(base)
      .sort({ lastSeen: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return { rows, total };
  }

  async getAllSensors(
    orgId: Types.ObjectId,
    opts: {
      page: number;
      limit: number;
      claimed?: string;
      search?: string;
      sort?: string;
      dir?: 'asc' | 'desc';
    },
  ) {
    const { page, limit, claimed, search, sort, dir } = opts;

    const base: any = {
      ignored: { $ne: true },
      $or: [{ orgId }, { orgId: null }],
    };
    if (claimed !== undefined) base.claimed = claimed === 'true';
    if (search?.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      base.$or.push({ mac: rx }, { displayName: rx });
    }

    const total = await this.sensorModel.countDocuments(base);
    const rows = await this.sensorModel
      .find(base)
      .sort({ [sort || 'lastSeen']: dir === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return { rows, total };
  }

  /**
   * Attach a sensor (already discovered by Lambda) to the caller’s org
   * and optionally set its display name.
   *
   * Rules:
   *  • Sensor must exist and belong to one of the caller’s gateways.
   *  • Caller’s org must match sensor.orgId.
   */
  async claimForUser(
    caller: { orgId: Types.ObjectId; role: UserRole },
    dto: ClaimSensorDto,
  ) {
    if (!caller.orgId)
      throw new BadRequestException('You are not in an organization');

    const sensor = await this.sensorModel.findOne({
      _id: dto.mac.toUpperCase(),
    });

    if (!sensor) throw new NotFoundException('Sensor not discovered yet');

    if (sensor.claimed && !sensor?.orgId?.equals(caller.orgId))
      throw new BadRequestException('Sensor already claimed by another org');

    /* 1️⃣ plan limit check (claimed probes only) */
    const claimedCount = await this.sensorModel.countDocuments({
      orgId: caller.orgId,
      claimed: true,
    });

    const org = await this.gwModel.db
      .collection('organizations')
      .aggregate([
        { $match: { _id: caller.orgId } },
        {
          $lookup: {
            from: 'plans',
            localField: 'planId',
            foreignField: '_id',
            as: 'plan',
          },
        },
        { $unwind: '$plan' },
        { $project: { maxSensors: '$plan.maxSensors' } },
      ])
      .next();

    if (org && claimedCount >= org.maxSensors)
      throw new BadRequestException('Sensor limit exceeded – upgrade plan.');

    /* 2️⃣ first-time claim */
    sensor.orgId = caller.orgId;
    sensor.claimed = true;

    // ignore flag stays untouched; nickname update is optional
    if (dto.displayName) sensor.displayName = dto.displayName;
    await sensor.save();

    return sensor.toObject();
  }

  async getDetails(mac: string, orgId: Types.ObjectId) {
    const s = await this.sensorModel
      .findOne({
        _id: mac,
        ignored: { $ne: true },
        $or: [{ orgId }, { orgId: null }],
      })
      .lean();
    if (!s) throw new NotFoundException('Sensor not visible to your org');
    return s;
  }

  /** update nickname / other mutable props */
  async updateSensor(
    mac: string,
    orgId: Types.ObjectId,
    dto: { displayName?: string },
  ) {
    const s = await this.sensorModel.findOneAndUpdate(
      { _id: mac, orgId },
      { $set: { displayName: dto.displayName } },
      { new: true },
    );
    if (!s) throw new NotFoundException('Sensor not found in your org');
    return s.toObject();
  }

  /** un-claim -> reset flags & scrub data link */
  async unclaim(mac: string, orgId: Types.ObjectId) {
    const upd = await this.sensorModel.findOneAndUpdate(
      { _id: mac, orgId },
      { $set: { orgId: null, claimed: false } },
      { new: true },
    );
    if (!upd) throw new NotFoundException('Sensor not found or not yours');
    return upd.toObject();
  }

  /** mini stats */
  async getStats(orgId: Types.ObjectId) {
    const [claimed, unclaimed] = await Promise.all([
      this.sensorModel.countDocuments({ orgId, claimed: true }),
      this.sensorModel.countDocuments({ orgId: null, ignored: { $ne: true } }),
    ]);

    // crude avg seconds between points (could be refined)
    const avgFreq = await this.sensorModel.aggregate([
      { $match: { orgId, claimed: true, lastSeen: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$lastSeen' } } },
    ]);

    return {
      claimed,
      unclaimed,
      avgReadingFrequency: Math.round(avgFreq?.[0]?.avg ?? 0),
    };
  }
}
