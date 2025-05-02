/**
 * One‑off bootstrap script:
 *  $ npm run seed:plans
 *
 * It spins up the Nest context, checks if the 3 default plans exist,
 * and inserts them if missing. Run locally or from a GitHub Action.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PlansService } from '../module/plans/plans.service';
import { PlanName } from '../module/plans/enums/plan.enum';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,        // silence Nest banner for script
  });

  const svc = app.get(PlansService);

  const defaults = [
    {
      name: PlanName.FREE,
      maxGateways: 1,
      maxSensors: 2,
      maxUsers: 5,
      retentionDays: 30,
    },
    {
      name: PlanName.PRO,
      maxGateways: 5,
      maxSensors: 50,
      maxUsers: 20,
      retentionDays: 90,
    },
    {
      name: PlanName.ENTERPRISE,
      maxGateways: 9999,
      maxSensors: 9999,
      maxUsers: 9999,
      retentionDays: 365,
    },
  ];

  for (const plan of defaults) {
    const exists = await svc.findByName?.(plan.name); // we’ll add this helper soon
    if (!exists) {
      await svc.create(plan as any);
      // eslint-disable-next-line no-console
      console.log(`Inserted plan: ${plan.name}`);
    }
  }

  await app.close();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
