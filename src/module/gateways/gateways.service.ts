import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Gateway, GatewayDocument } from './gateways.schema';
import { Organization, OrganizationDocument } from '../organizations/organizations.schema';
import { GatewayStatus } from './enums/gateway.enum';

@Injectable()
export class GatewaysService {
  constructor(
    @InjectModel(Gateway.name)
    private readonly gwModel: Model<GatewayDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
  ) {}

  /** Claim a factory gateway for an org, enforcing plan.maxGateways */
  async claimForOrg(orgId: string, claimId: string) {
    /* 1️⃣ find unclaimed gateway */
    const gw = await this.gwModel.findOne({ _id: claimId, orgId: null }).exec() as any;
    if (!gw) throw new NotFoundException('Claim ID not found or already claimed');

    /* 2️⃣ load org + plan limits */
    const org = await this.orgModel
      .findById(orgId)
      .populate<{ planId: { maxGateways: number } }>('planId', 'maxGateways needsUpgrade')
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
    gw.orgId  = org._id;
    gw.status = GatewayStatus.CLAIMED;
    await gw.save();

    return gw.toObject();
  }
}
