import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Plan, PlanDocument } from '../module/plans/plans.schema';
import { PlanName } from '../module/plans/enums/plan.enum';
import { Organization, OrganizationDocument } from '../module/organizations/organizations.schema';
import { Gateway, GatewayDocument } from '../module/gateways/gateways.schema';

/**
 * One-off seed script for your own org and gateway
 * Usage: npm run seed:org-gateway-custom
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  // Models
  const planModel = app.get<Model<PlanDocument>>(getModelToken(Plan.name));
  const orgModel = app.get<Model<OrganizationDocument>>(getModelToken(Organization.name));
  const gatewayModel = app.get<Model<GatewayDocument>>(getModelToken(Gateway.name));

  // 1️⃣ Ensure Free plan exists
  const freePlan = await planModel.findOne({ name: PlanName.FREE });
  if (!freePlan) {
    console.error('❌ Free plan not found. Run seed:plans first.');
    process.exit(1);
  }

  // 2️⃣ Upsert Anuj's Organization
  const domain = 'anuj.verma';
  let org = await orgModel.findOne({ domain });
  if (!org) {
    org = await orgModel.create({
      name: 'Anuj Verma Corp',
      domain,
      planId: freePlan._id,
    });
    console.log('Inserted organization:', (org as OrganizationDocument & { _id: Types.ObjectId })._id.toString());
  } else {
    console.log('Organization already exists:', (org as OrganizationDocument & { _id: Types.ObjectId })._id.toString());
  }

  // 3️⃣ Upsert gw_dev001 Gateway
  const gatewayId = 'gw_dev001';
  let gateway = await gatewayModel.findById(gatewayId);
  if (!gateway) {
    gateway = await gatewayModel.create({
      _id: gatewayId,
      mac: 'AA:BB:CC:DD:EE:FF',
      orgId: org._id,
      certId: 'test-cert-001',
      status: 'claimed',
    });
    console.log('Inserted gateway:', gateway._id);
  } else {
    console.log('Gateway already exists:', gateway._id);
  }

  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});