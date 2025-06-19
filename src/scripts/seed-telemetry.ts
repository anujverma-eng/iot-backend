/* ------------------------------------------------------------
 *  $ npm run seed:telemetry
 * ------------------------------------------------------------
 *  ‣ Generates realistic telemetry for the four demo probes.
 *  ‣ 30-50 points each day, evenly spread between 00:00-23:59 UTC
 *  ‣ Sensor-specific value ranges:
 *      • temperature  –10 °C …  40 °C
 *      • humidity       0 % … 100 %
 *      • pressure     950 … 1050 hPa
 *      • battery        5 % … 100 %
 * ---------------------------------------------------------- */

import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { randomInt, randomUUID } from 'crypto';
import { addDays, startOfDay } from 'date-fns';
import { AppModule } from '../app.module';
import { Telemetry } from '../module/telemetry/telemetry.schema';
import { Model } from 'mongoose';

type Probe = {
  mac: string;
  type: 'temperature' | 'humidity' | 'pressure' | 'battery';
  unit: string;
};

/* ---- the four demo probes -------------------------------- */
const probes: Probe[] = [
  { mac: 'F4:99:AA:01', type: 'temperature', unit: '°C' },
  { mac: 'F4:99:AA:02', type: 'humidity', unit: '%' },
  { mac: 'F4:99:AA:03', type: 'pressure', unit: 'hPa' },
  { mac: 'F4:99:AA:04', type: 'battery', unit: '%' },
];

/* ---- helper: make a random reading in the right range ---- */
function genValue(type: Probe['type']): number {
  switch (type) {
    case 'temperature':
      return +(randomInt(-10, 40) + Math.random()).toFixed(1);
    case 'humidity':
      return randomInt(0, 100);
    case 'pressure':
      return randomInt(950, 1050);
    case 'battery':
      return randomInt(5, 100);
  }
}

/* ---- main bootstrap -------------------------------------- */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const TelemetryModel = app.get<Model<Telemetry>>(
    getModelToken(Telemetry.name),
  );

  const start = new Date(Date.UTC(2025, 5, 2)); // 02-June-2025 00:00 UTC
  const days = 17; // until 17-Jun-2025 inclusive`

  const bulk = TelemetryModel.collection.initializeUnorderedBulkOp();

  for (let d = 0; d < days; d++) {
    const dayStart = addDays(start, d).getTime(); // epoch ms for 00:00
    for (const p of probes) {
      const points = randomInt(30, 51); // 30-50 points
      for (let i = 0; i < points; i++) {
        const offset = randomInt(0, 86_400_000); // any ms of the day
        bulk.insert({
          // _id: randomUUID(), // optional; Mongo will create its own if omitted
          sensorId: p.mac, // keep simple (no gwId#) for mock
          ts: new Date(dayStart + offset),
          value: genValue(p.type),
        });
      }
    }
  }

  const result = await bulk.execute();
  // eslint-disable-next-line no-console
  console.log(`✅ inserted ${result.insertedCount} telemetry documents`);

  await app.close();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
