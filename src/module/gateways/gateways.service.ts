import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage, ObjectId } from 'mongoose';
import { Gateway, GatewayDocument } from './gateways.schema';
import {
  Organization,
  OrganizationDocument,
} from '../organizations/organizations.schema';
import { GatewayStatus } from './enums/gateway.enum';
import { CertsService } from '../certs/certs.service';
import { Sensor, SensorDocument } from '../sensors/sensors.schema';
import { Telemetry, TelemetryDocument } from '../telemetry/telemetry.schema';

@Injectable()
export class GatewaysService {
  constructor(
    @InjectModel(Gateway.name)
    private readonly gwModel: Model<GatewayDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Sensor.name)
    private readonly sensorModel: Model<SensorDocument>,
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<TelemetryDocument>,
    private readonly certsSvc: CertsService,
  ) {}

  async adminCreateOne(mac: string) {
    if (await this.gwModel.findOne({ mac })) {
      throw new ConflictException('MAC already exists');
    }

    const gatewayId = `gw_${randomUUID().slice(0, 8)}`;
    const bundle = await this.certsSvc.provisionGateway(gatewayId, mac);

    const saved = await this.gwModel.create({
      _id: gatewayId,
      mac,
      certId: bundle.certId,
      certPem: bundle.certPem,
      keyPem: bundle.keyPem,
      caPem: bundle.caPem,
      packS3Key: bundle.packS3Key,
      status: GatewayStatus.ACTIVE,
    });

    return { ...saved.toObject(), downloadUrl: bundle.download };
  }

  /** ��️  Bulk create (max 10 per request) */
  async adminCreateBulk(macs: string[]) {
    if (macs.length === 0 || macs.length > 10)
      throw new BadRequestException('1‑10 MACs per call');

    const results = [] as any;
    for (const mac of macs) {
      const result = await this.adminCreateOne(mac);
      results.push(result);
    }
    return results;
  }

  async registerForOrg(orgId: string, dto: { mac: string; label?: string; location?: string }) {
    if (!orgId) throw new BadRequestException('You are not in an organization');

    /* 1️⃣ plan quota */
    const org = await this.orgModel
      .findById(orgId)
      .populate<{ planId: { maxGateways: number } }>('planId', 'maxGateways')
      .lean();
    if (!org) throw new BadRequestException('Organization not found');

    const count = await this.gwModel.countDocuments({ orgId });
    if (count >= org.planId.maxGateways)
      throw new ForbiddenException('Gateway limit exceeded – upgrade plan');

    /* 2️⃣ duplicate MAC? */
    if (await this.gwModel.exists({ mac: dto.mac }))
      throw new ConflictException('MAC already registered');

    /* 3️⃣ provision Thing  certs */
    const gatewayId = `gw_${randomUUID().slice(0, 8)}`;
    const bundle = await this.certsSvc.provisionGateway(gatewayId, dto.mac);

    /* 4️⃣ persist row */
    const saved = await this.gwModel.create({
      _id: gatewayId,
      mac: dto.mac,
      orgId,
      certId: bundle.certId,
      certPem: bundle.certPem,
      keyPem: bundle.keyPem,
      caPem: bundle.caPem,
      packS3Key: bundle.packS3Key,
      status: GatewayStatus.ACTIVE,
      ...(dto.label && { label: dto.label }),
      ...(dto.location && { location: dto.location }),
    });

    return { ...saved.toObject(), downloadUrl: bundle.download };
  }

  async listForOrg(
    orgId: string,
    opts: { page: number; limit: number; search?: string },
  ) {
    const { page, limit, search } = opts;

    // 1. Always match on orgId
    const baseMatch: PipelineStage.Match = {
      $match: { orgId: new Types.ObjectId(orgId) },
    };

    // 2. If `search` is supplied, create a case-insensitive regex
    //    and also match against `mac` OR `label` OR `location`. Otherwise, skip it.
    const searchStage: PipelineStage.Match | null = search
      ? {
          $match: {
            $or: [
              { mac: { $regex: search.trim(), $options: 'i' } },
              { label: { $regex: search.trim(), $options: 'i' } },
              { location: { $regex: search.trim(), $options: 'i' } },
            ],
          },
        }
      : null;

    // 3. This $lookup will count how many sensors (grouped by `claimed`) each gateway has
    const sensorCountsLookup: PipelineStage.Lookup = {
      $lookup: {
        from: 'sensors',
        let: { gwId: '$_id', currentOrgId: new Types.ObjectId(orgId) },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ['$$gwId', '$lastSeenBy'] },
                  {
                    $or: [
                      { $eq: ['$orgId', '$$currentOrgId'] }, // claimed sensors belonging to this org
                      { $eq: ['$orgId', null] }, // unclaimed sensors
                    ],
                  },
                ],
              },
            },
          },
          // Group by claimed=true/false and count them
          {
            $group: {
              _id: '$claimed',
              c: { $sum: 1 },
            },
          },
        ],
        as: 'sensorCounts',
      },
    };

    // 4. Build the “rows” facet: sort, skip, limit, then append sensorCounts
    const rowsSubFacet: PipelineStage[] = [
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      sensorCountsLookup,
      {
        $project: {
          _id: 1,
          mac: 1,
          status: 1,
          lastSeen: 1,
          label: 1,
          location: 1,
          createdAt: 1,
          updatedAt: 1,
          sensorCounts: 1,
          isConnected: 1,
        },
      },
    ];

    // 5. Build the full aggregation pipeline
    const pipeline: PipelineStage[] = [];

    // a) always match on orgId first
    pipeline.push(baseMatch);

    // b) if searchStage is not null, push it
    if (searchStage) {
      pipeline.push(searchStage);
    }

    // c) now facet into `rows` and `total`
    pipeline.push({
      $facet: {
        rows: rowsSubFacet as PipelineStage.FacetPipelineStage[],
        total: [{ $count: 'n' }] as PipelineStage.FacetPipelineStage[],
      },
    });

    // d) unwind total count (so total = 0 if none)
    pipeline.push({
      $unwind: {
        path: '$total',
        preserveNullAndEmptyArrays: true,
      },
    });

    // e) project out the final shape: { rows: [...], total: <number> }
    pipeline.push({
      $project: {
        rows: 1,
        total: { $ifNull: ['$total.n', 0] },
      },
    });

    // 6. Run the aggregation
    const [result] = await this.gwModel.aggregate(pipeline).exec();
    // result.rows = [ ... gateway docs + sensorCounts ... ]
    // result.total = <integer>

    return {
      rows: result.rows,
      total: result.total,
    };
  }

  async getDetails(gwId: string, orgId: string) {
    const params: Record<string, any> = { _id: gwId, orgId };
    // If gwId is ObjectId, change the params to match objectid
    if (Types.ObjectId.isValid(gwId)) {
      params._id = new Types.ObjectId(gwId);
    }

    if (Types.ObjectId.isValid(orgId)) {
      params.orgId = new Types.ObjectId(orgId);
    }

    const gw = await this.gwModel
      .findOne(params)
      .select(
        '_id mac status claimCode lastSeen createdAt updatedAt orgId label location',
      )
      .lean();
    if (!gw) throw new NotFoundException('Gateway not found in your org');

    const sensorCounts = await this.sensorModel.aggregate([
      {
        $match: {
          lastSeenBy: gwId,
          $or: [
            { orgId: new Types.ObjectId(orgId) }, // claimed sensors belonging to this org
            { orgId: null }, // unclaimed sensors
          ],
        },
      },
      {
        $group: {
          _id: '$claimed',
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      ...gw,
      sensors: {
        claimed: sensorCounts.find((c) => c._id === true)?.count ?? 0,
        unclaimed: sensorCounts.find((c) => c._id === false)?.count ?? 0,
      },
      sensorCounts,
    };
  }

  /** stats for quick dashboard tiles */
  async getStats(orgId: string) {
    const [totals, live] = await Promise.all([
      this.gwModel.countDocuments({ orgId }),
      this.gwModel.countDocuments({
        orgId,
        lastSeen: { $gte: new Date(Date.now() - 5 * 60_000) }, // seen in 5 min
      }),
    ]);
    return { totalGateways: totals, liveGateways: live };
  }

  /** update gateway fields (label, location) */
  async updateGateway(id: string, orgId: string, updates: { label?: string; location?: string }) {
    const updateFields: any = {};
    if (updates.label !== undefined) updateFields.label = updates.label;
    if (updates.location !== undefined) updateFields.location = updates.location;

    const gw = await this.gwModel.findOneAndUpdate(
      { _id: id,  orgId: new Types.ObjectId(orgId) },
      { $set: updateFields },
      { new: true },
    );
    if (!gw) throw new NotFoundException('Gateway not found in your org');
    return gw.toObject();
  }

  /** update just the label - keeping for backward compatibility */
  async updateLabel(id: string, orgId: string, label?: string) {
    return this.updateGateway(id, orgId, { label });
  }

  /** sensors under a gateway with filtering / sorting */
  async sensorsForGateway(
    gwId: string,
    orgId: string,
    opts: {
      page: number;
      limit: number;
      claimed?: string;
      search?: string;
      sort?: string;
      dir?: 'asc' | 'desc';
    },
  ) {
    // make sure the gateway belongs to caller
    (await this.gwModel.exists({ _id: gwId, orgId: new Types.ObjectId(orgId) })) ||
      (() => {
        throw new NotFoundException('Gateway not found');
      })();

    const { page, limit, claimed, search, sort, dir } = opts;

    const base: any = {
      lastSeenBy: gwId,
      ignored: { $ne: true },
      $or: [{ orgId: new Types.ObjectId(orgId) }, { orgId: null }],
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

  async attachSensors(gwId: string, orgId: string, macs: string[]) {
    // ownership check
    (await this.gwModel.exists({ _id: gwId, orgId: new Types.ObjectId(orgId) })) ||
      (() => {
        throw new NotFoundException('Gateway not found');
      })();

    await this.sensorModel.updateMany(
      { _id: { $in: macs }, ignored: { $ne: true } },
      { $addToSet: { lastSeenBy: gwId } },
    );
    return { added: macs.length };
  }

  async deleteGateway(gwId: string, orgId: string) {
    // Check if gateway exists and belongs to the organization
    const gateway = await this.gwModel.findOne({ _id: gwId, orgId: new Types.ObjectId(orgId) }).lean();
    if (!gateway) {
      throw new NotFoundException('Gateway not found in your organization');
    }

    try {
      // 1. Remove this gateway from sensors' lastSeenBy arrays
      await this.sensorModel.updateMany(
        { lastSeenBy: gwId, orgId: new Types.ObjectId(orgId) },
        {
          $pull: { lastSeenBy: gwId },
          orgId: null,
          favorite: false,
          displayName: '',
          claimed: false,
        },
      );

      // 2. Clean up telemetry data for sensors that were only seen by this gateway
      // Find sensors that were ONLY seen by this gateway and remove their telemetry
      const orphanedSensors = await this.sensorModel
        .find({
          lastSeenBy: { $size: 0 }, // After removing gwId, lastSeenBy is empty
          orgId: null, // Unclaimed sensors
        })
        .select('_id')
        .lean();

      if (orphanedSensors.length > 0) {
        const orphanedSensorIds = orphanedSensors.map((s) => s._id);
        await this.telemetryModel.deleteMany({
          sensorId: { $in: orphanedSensorIds },
        });
      }

      // 3. Delete the gateway from database first
      await this.gwModel.deleteOne({ _id: gwId, orgId });
      // await this.gwModel.updateOne(
      //   { _id: gwId, orgId },
      //   { $set: { orgId: new Types.ObjectId('68282f0d90804acdfb54738d') } },
      // );

      // 4. Clean up AWS IoT certificates, thing, and S3 resources in background
      this.cleanupGatewayResourcesInBackground(
        gateway._id, // thingName
        gateway.certId,
        gateway.packS3Key,
      );

      return {
        message: 'Gateway deleted successfully',
        deletedGatewayId: gwId,
        cleanedUp: {
          sensors: `Updated sensors by removing gateway reference`,
          // telemetry: `Removed telemetry for ${orphanedSensors.length} orphaned sensors`,
          certificates: 'AWS IoT certificate cleanup initiated in background',
          s3: gateway.packS3Key
            ? 'S3 certificate pack cleanup initiated in background'
            : 'No S3 pack to delete',
        },
      };
    } catch (error) {
      // If cleanup fails, we still want to remove the gateway from our database
      // but we should log the error and inform the user
      console.error(`Error during gateway cleanup for ${gwId}:`, error);

      // Still delete the gateway record
      await this.gwModel.deleteOne({ _id: gwId, orgId });

      return {
        message:
          'Gateway deleted from database, but some cleanup operations failed',
        deletedGatewayId: gwId,
        warning:
          'Some AWS resources may not have been cleaned up properly. Check logs for details.',
        error: error.message,
      };
    }
  }

  /**
   * Background cleanup method for AWS resources
   * This runs asynchronously without blocking the API response
   */
  private cleanupGatewayResourcesInBackground(
    thingName: string,
    certId: string,
    packS3Key?: string,
  ): void {
    // Run cleanup asynchronously without awaiting
    this.certsSvc
      .cleanupGateway(thingName, certId, packS3Key)
      .then(() => {
        console.log(`✅ Background cleanup completed for gateway ${thingName}`);
      })
      .catch((error) => {
        console.error(
          `❌ Background cleanup failed for gateway ${thingName}:`,
          error,
        );
        // You could optionally:
        // - Store failed cleanup tasks in a queue for retry
        // - Send notifications to admins
        // - Log to monitoring service
      });
  }
}
