// src/iot/iot-sim.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  IoTDataPlaneClient,
  PublishCommand,
} from '@aws-sdk/client-iot-data-plane';

export interface SensorConfig {
  name: string;
  mac: string;
  type: string;
  unit: string;
}

export interface GatewayConfig {
  gatewayId: string;
  sensors: SensorConfig[];
}

@Injectable()
export class IotSimService {
  private readonly log = new Logger(IotSimService.name);
  private readonly client = new IoTDataPlaneClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: `https://${process.env.IOT_ENDPOINT_HOST}`,
  });
  private enc = new TextEncoder();
  private timers: NodeJS.Timeout[] = [];
  private gatewayConfigs: Map<string, SensorConfig[]> = new Map();

  // Default sensor configurations
  private defaultSensors: SensorConfig[] = [
    {
      name: 'BluePSI001',
      mac: '94:54:93:20:D1:26',
      type: 'pressure',
      unit: 'psi',
    },
    {
      name: 'BluePSI002',
      mac: '54:64:DE:12:C9:89',
      type: 'pressure',
      unit: 'psi',
    },
  ];

  private rnd(seed: number) {
    // light pseudo-random per call (mulberry32-ish)
    let t = (seed + Date.now()) >>> 0;
    t += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private generateValueByType(type: string, seed: number): number {
    switch (type.toLowerCase()) {
      case 'pressure':
        const base = 0.0914286;
        const jitter = (this.rnd(seed) - 0.5) * 0.9; // ±0.005
        return +(base + jitter).toFixed(7);

      case 'temperature':
        // Temperature range: 20-30°C with small variations
        const tempBase = 25;
        const tempJitter = (this.rnd(seed) - 0.5) * 10; // ±5°C
        return +(tempBase + tempJitter).toFixed(2);

      case 'humidity':
        // Humidity range: 40-70% with variations
        const humidityBase = 55;
        const humidityJitter = (this.rnd(seed) - 0.5) * 30; // ±15%
        return Math.max(
          0,
          Math.min(100, +(humidityBase + humidityJitter).toFixed(1)),
        );

      case 'voltage':
        // Voltage range: 3.0-3.3V typical for sensors
        const voltageBase = 3.15;
        const voltageJitter = (this.rnd(seed) - 0.5) * 0.3; // ±0.15V
        return +(voltageBase + voltageJitter).toFixed(3);

      default:
        // Default to a simple 0-100 range
        return +(this.rnd(seed) * 100).toFixed(2);
    }
  }

  private makePayload(gw: string) {
    // Get sensor config for this gateway (use default if not specified)
    const sensors = this.gatewayConfigs.get(gw) || this.defaultSensors;

    const batteryRangeSelector = this.rnd(gw.length + Date.now());
    let battery: number;

    if (batteryRangeSelector < 0.33) {
      // Low battery: 0-20%
      battery = Math.round(this.rnd(Date.now() + 1) * 20);
    } else if (batteryRangeSelector < 0.46) {
      // Medium battery: 20-60%
      battery = Math.round(20 + this.rnd(Date.now() + 2) * 40);
    } else if (batteryRangeSelector < 0.66) {
    } else {
      // High battery: 60-100%
      battery = Math.round(60 + this.rnd(Date.now() + 3) * 40);
    }

    const sensorsWithValues = sensors.map((sensor, i) => ({
      name: sensor.name,
      mac: sensor.mac,
      type: sensor.type,
      unit: sensor.unit,
      value: this.generateValueByType(sensor.type, i + gw.length + Date.now()),
      battery,
    }));

    // Generate battery level in one of three ranges: 0-20, 20-60, or 60-100

    return {
      gatewayId: gw,
      ts: new Date().toISOString(),
      sensors: sensorsWithValues,
    };
  }

  async publishOnce(gw: string) {
    const topic = `${gw}/data`;
    const payloadObj = this.makePayload(gw);
    const payload = this.enc.encode(JSON.stringify(payloadObj));
    try {
      await this.client.send(
        new PublishCommand({
          topic,
          qos: 0,
          payload,
          contentType: 'application/json',
        }),
      );
      this.log.debug(`published → ${topic}`, payloadObj);
    } catch (err) {
      this.log.error(`publish failed for ${gw}`, err);
    }
  }

  // Configure sensors for specific gateways
  setSensorConfig(gatewayConfigs: GatewayConfig[]) {
    this.gatewayConfigs.clear();
    for (const config of gatewayConfigs) {
      this.gatewayConfigs.set(config.gatewayId, config.sensors);
    }
    this.log.log(
      `Updated sensor configurations for ${gatewayConfigs.length} gateways`,
    );
  }

  // Start simulator with simple gateway list (uses default sensors)
  start(gateways: string[], intervalSeconds = 1) {
    this.stop();
    const periodMs = Math.max(100, intervalSeconds * 1000); // Convert seconds to milliseconds
    for (const gw of gateways) {
      const t = setInterval(
        () => this.publishOnce(gw).catch((err) => this.log.error(err)),
        periodMs,
      );
      this.timers.push(t);
    }
    this.log.log(
      `Simulator started for [${gateways.join(', ')}] with ${intervalSeconds}s interval each`,
    );
  }

  // Start simulator with detailed gateway configurations
  startWithConfig(gatewayConfigs: GatewayConfig[], intervalSeconds = 1) {
    this.setSensorConfig(gatewayConfigs);
    const gateways = gatewayConfigs.map((config) => config.gatewayId);
    this.start(gateways, intervalSeconds);
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.log.log('Simulator stopped');
  }
}
