import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Gateway, GatewayDocument } from './gateways.schema';
import {
  Organization,
  OrganizationDocument,
} from '../organizations/organizations.schema';
import { GatewayStatus } from './enums/gateway.enum';
import { CertsService } from '../certs/certs.service';
import { ClaimGatewayDto } from './dto/gateway.dto';

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
    const claimCode = this.genCode();

    const saved = await this.gwModel.create({
      _id: gatewayId,
      mac,
      claimCode,
      certId: bundle.certId,
      certPem: bundle.certPem,
      keyPem: bundle.keyPem,
      caPem: bundle.caPem,
      packS3Key: bundle.packS3Key,
      status: GatewayStatus.UNCLAIMED,
    });

    /* ➕ add file to zip */
    await this.certsSvc.addFileToPack(
      bundle.packS3Key,
      'claim-code.txt',
      claimCode,
    );

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
  async claimForOrg(orgId: string, dto: ClaimGatewayDto) {
    /* 1️ find unclaimed gateway */
    const gw = (await this.gwModel.findOne({
      _id: dto.claimId,
      orgId: null,
      claimCode: dto.claimCode,
    })) as any;

    if (!gw)
      throw new NotFoundException('Claim ID not found or already claimed');

    /* 2️ load org + plan limits */
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

    /* 3️ attach gateway to org */
    gw.orgId = org._id;
    gw.status = GatewayStatus.CLAIMED;
    await gw.save();

    return gw.toObject();
  }

  genCode() {
    return randomBytes(4)
      .toString('base64') // 6 chars like “Xa9oZQ==”
      .replace(/[^A-Z0-9]/gi, '') // strip symbols
      .slice(0, 6)
      .toUpperCase();
  }
}
