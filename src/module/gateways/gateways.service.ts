import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PipelineStage } from 'mongoose';
import { Gateway, GatewayDocument } from './gateways.schema';
import {
  Organization,
  OrganizationDocument,
} from '../organizations/organizations.schema';
import { GatewayStatus } from './enums/gateway.enum';
import { CertsService } from '../certs/certs.service';
import { Sensor, SensorDocument } from '../sensors/sensors.schema';

@Injectable()
export class GatewaysService {
  constructor(
    @InjectModel(Gateway.name)
    private readonly gwModel: Model<GatewayDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Sensor.name)
    private readonly sensorModel: Model<SensorDocument>,
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

  async registerForOrg(orgId: string, dto: { mac: string; label?: string }) {
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
    //    and also match against `mac` OR `label`. Otherwise, skip it.
    const searchStage: PipelineStage.Match | null = search
      ? {
          $match: {
            $or: [
              { mac: { $regex: search.trim(), $options: 'i' } },
              { label: { $regex: search.trim(), $options: 'i' } },
            ],
          },
        }
      : null;

    // 3. This $lookup will count how many sensors (grouped by `claimed`) each gateway has
    const sensorCountsLookup: PipelineStage.Lookup = {
      $lookup: {
        from: 'sensors',
        let: { gwId: '$_id' },
        pipeline: [
          {
            // Keep only sensors whose lastSeenBy array contains this gatewayID
            $match: {
              $expr: { $in: ['$$gwId', '$lastSeenBy'] },
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
          createdAt: 1,
          updatedAt: 1,
          sensorCounts: 1,
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
    const gw = await this.gwModel
      .findOne({ _id: gwId, orgId })
      .select(
        '_id mac status claimCode lastSeen createdAt updatedAt orgId label',
      )
      .lean();
    if (!gw) throw new NotFoundException('Gateway not found in your org');

    const sensorCounts = await this.sensorModel.aggregate([
      { $match: { lastSeenBy: gwId } },
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

  /** update just the label */
  async updateLabel(id: string, orgId: string, label?: string) {
    const gw = await this.gwModel.findOneAndUpdate(
      { _id: id, orgId },
      { $set: { label } },
      { new: true },
    );
    if (!gw) throw new NotFoundException('Gateway not found in your org');
    return gw.toObject();
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
    (await this.gwModel.exists({ _id: gwId, orgId })) ||
      (() => {
        throw new NotFoundException('Gateway not found');
      })();

    const { page, limit, claimed, search, sort, dir } = opts;

    const base: any = {
      lastSeenBy: gwId,
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

  async attachSensors(gwId: string, orgId: string, macs: string[]) {
    // ownership check
    (await this.gwModel.exists({ _id: gwId, orgId })) ||
      (() => {
        throw new NotFoundException('Gateway not found');
      })();

    await this.sensorModel.updateMany(
      { _id: { $in: macs }, ignored: { $ne: true } },
      { $addToSet: { lastSeenBy: gwId } },
    );
    return { added: macs.length };
  }
}
