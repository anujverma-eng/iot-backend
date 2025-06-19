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
import { Telemetry } from '../telemetry/telemetry.schema';
import { SensorType } from './enums/sensor.enum';

@Injectable()
export class SensorsService {
  constructor(
    @InjectModel(Sensor.name)
    private readonly sensorModel: Model<SensorDocument>,
    @InjectModel(Gateway.name) private readonly gwModel: Model<GatewayDocument>,
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<Telemetry>,
  ) {}

  async getMeta(ids: string[]) {
    const docs = await this.sensorModel
      .find({ _id: { $in: ids } }, { mac: 1, type: 1, unit: 1 })
      .lean();
    return Object.fromEntries(docs.map((d) => [d._id, d]));
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
      type?: SensorType;
    },
  ) {
    const { page, limit, claimed, search, sort, dir, type } = opts;

    // 1. find all gateway IDs for this org
    const gateways = await this.gwModel.find({ orgId }, { _id: 1 }).lean();
    const gatewayIds = gateways.map((gw) => gw._id);

    // 2. build the “base” query for sensors in those gateways
    const base: any = {
      ignored: { $ne: true },
      lastSeenBy: { $in: gatewayIds },
      $or: [{ orgId }, { orgId: null }],
      ...(type && { type }),
    };

    // 3. filter by claimed if provided
    if (claimed !== undefined) {
      base.claimed = claimed === 'true';
    }

    // 4. text‐index search if “search” is non‐empty
    if (search?.trim()) {
      // Use $text so Mongo uses the text index on { mac, displayName }
      base.$text = { $search: search.trim() };
    }

    // 5. count total matching docs
    const total = await this.sensorModel.countDocuments(base);

    const sortField = sort || 'lastSeen';
    const sortOrder = dir === 'asc' ? 1 : -1;

    // For simplicity, if you don’t care about sorting by relevance, always sort on sortField:
    const rows = await this.sensorModel
      .find(base)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // 7. populate lastValue (latest telemetry)
    for (const sensor of rows as any) {
      const lastReading = await this.telemetryModel
        .findOne({ sensorId: sensor._id })
        .sort({ ts: -1 })
        .lean();
      sensor.lastValue = lastReading?.value || 0;
    }

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

  async addToFavorite(mac: string, orgId: Types.ObjectId) {
    // if favorite already true, then make it false, else set to true
    const existing = await this.sensorModel.findOne({ _id: mac, orgId });
    if (!existing) throw new NotFoundException('Sensor not found in your org');
    const s = await this.sensorModel.findOneAndUpdate(
      { _id: mac, orgId },
      { $set: { favorite: !existing.favorite } },
    );
    if (!s) throw new NotFoundException('Sensor not found in your org');
    return s.toObject();
  }

  /** un-claim -> reset flags & scrub data link */
  async unclaim(mac: string, orgId: Types.ObjectId) {
    const upd = await this.sensorModel.findOneAndUpdate(
      { _id: mac, orgId },
      { $set: { orgId: null, claimed: false } },
    );
    if (!upd) throw new NotFoundException('Sensor not found or not yours');
    return upd.toObject();
  }

  /** mini stats */
  async getStats(orgId: Types.ObjectId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [claimed, unclaimed, liveSensors, offlineSensors] = await Promise.all(
      [
        this.sensorModel.countDocuments({ orgId, claimed: true }),
        this.sensorModel.countDocuments({
          orgId: null,
          ignored: { $ne: true },
        }),
        this.sensorModel.countDocuments({ orgId, lastSeen: { $gte: today } }),
        this.sensorModel.countDocuments({ orgId, lastSeen: { $lt: today } }),
      ],
    );

    // crude avg seconds between points (could be refined)
    const avgFreq = await this.sensorModel.aggregate([
      { $match: { orgId, claimed: true, lastSeen: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$lastSeen' } } },
    ]);

    return {
      claimed,
      unclaimed,
      liveSensors,
      offlineSensors,
      avgReadingFrequency: Math.round(avgFreq?.[0]?.avg ?? 0),
    };
  }
}
