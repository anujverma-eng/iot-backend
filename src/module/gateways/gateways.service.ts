import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Gateway, GatewayDocument } from './gateways.schema';
import {
  Organization,
  OrganizationDocument,
} from '../organizations/organizations.schema';
import { GatewayStatus } from './enums/gateway.enum';
import { CertsService } from '../certs/certs.service';

@Injectable()
export class GatewaysService {
  constructor(
    @InjectModel(Gateway.name)
    private readonly gwModel: Model<GatewayDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
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
      status: GatewayStatus.UNCLAIMED,
    });

    return { ...saved.toObject(), downloadUrl: bundle.download };
  }

  /** 🗂️  Bulk create (max 10 per request) */
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

  /** Claim a factory gateway for an org, enforcing plan.maxGateways */
  async claimForOrg(orgId: string, claimId: string) {
    /* 1️⃣ find unclaimed gateway */
    const gw = (await this.gwModel
      .findOne({ _id: claimId, orgId: null })
      .exec()) as any;
    if (!gw)
      throw new NotFoundException('Claim ID not found or already claimed');

    /* 2️⃣ load org + plan limits */
    const org = await this.orgModel
      .findById(orgId)
      .populate<{
        planId: { maxGateways: number };
      }>('planId', 'maxGateways needsUpgrade')
      .exec();
    if (!org) throw new BadRequestException('Organization not found');

    const currentCount = await this.gwModel.countDocuments({ orgId }).exec();
    if (currentCount >= org.planId.maxGateways) {
      /* mark upgrade flag if not set */
      if (!org.needsUpgrade) {
        org.needsUpgrade = true;
        await org.save();
      }
      throw new ForbiddenException('Gateway limit exceeded – upgrade plan');
    }

    /* 3️⃣ attach gateway to org */
    gw.orgId = org._id;
    gw.status = GatewayStatus.CLAIMED;
    await gw.save();

    return gw.toObject();
  }
}
