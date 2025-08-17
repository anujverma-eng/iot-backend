// src/scripts/iot-simulator.ts
import { config } from 'dotenv';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';

// Load environment variables from .env file
config();

const region = process.env.AWS_REGION || 'us-east-1';
const endpointHost = process.env.IOT_ENDPOINT_HOST; // e.g. a2r71vab5hezzm-ats.iot.us-east-1.amazonaws.com
if (!endpointHost) {
  console.error('Missing IOT_ENDPOINT_HOST');
  process.exit(1);
}

const client = new IoTDataPlaneClient({
  region,
  endpoint: `https://${endpointHost}`,
});

const gateways =
  (process.env.SIM_GATEWAYS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

if (gateways.length === 0) {
  console.error('Provide at least one gateway via SIM_GATEWAYS');
  process.exit(1);
}

const rate = Math.max(0.1, Number(process.env.SIM_RATE || 1)); // msgs/sec per gateway
const periodMs = Math.round(1000 / rate);
const durationSec = Math.max(0, Number(process.env.SIM_DURATION || 0));

const enc = new TextEncoder();

// Sensor configuration - can be customized per gateway
// You can also set SENSOR_CONFIG_JSON environment variable with JSON configuration
const defaultSensorConfigs = {
  default: [
    { name: 'BluePSI001', mac: '94:54:93:20:D1:26', type: 'pressure', unit: 'psi' },
    { name: 'BluePSI002', mac: '54:64:DE:12:C9:89', type: 'pressure', unit: 'psi' },
  ],
  // Add gateway-specific configs if needed
  // 'gw_81978fa4': [
  //   { name: 'CustomSensor1', mac: 'AA:BB:CC:DD:EE:FF', type: 'pressure', unit: 'psi' },
  //   { name: 'TempSensor1', mac: '11:22:33:44:55:66', type: 'temperature', unit: '°C' },
  // ],
};

// Load sensor configuration from environment variable if provided
let sensorConfigs = defaultSensorConfigs;
if (process.env.SENSOR_CONFIG_JSON) {
  try {
    sensorConfigs = JSON.parse(process.env.SENSOR_CONFIG_JSON);
    console.log('[SIM] Loaded custom sensor configurations from SENSOR_CONFIG_JSON');
  } catch (err) {
    console.error('[SIM] Failed to parse SENSOR_CONFIG_JSON, using defaults:', err);
  }
}

function rnd(seed: number) {
  // light pseudo-random per call (mulberry32-ish)
  let t = (seed + Date.now()) >>> 0;
  t += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function generateValueByType(type: string, seed: number): number {
  switch (type.toLowerCase()) {
    case 'pressure':
      const base = 0.0914286;
      const jitter = (rnd(seed) - 0.5) * 0.01; // ±0.005
      return +(base + jitter).toFixed(7);
    
    case 'temperature':
      // Temperature range: 20-30°C with small variations
      const tempBase = 25;
      const tempJitter = (rnd(seed) - 0.5) * 10; // ±5°C
      return +(tempBase + tempJitter).toFixed(2);
    
    case 'humidity':
      // Humidity range: 40-70% with variations
      const humidityBase = 55;
      const humidityJitter = (rnd(seed) - 0.5) * 30; // ±15%
      return Math.max(0, Math.min(100, +(humidityBase + humidityJitter).toFixed(1)));
    
    case 'voltage':
      // Voltage range: 3.0-3.3V typical for sensors
      const voltageBase = 3.15;
      const voltageJitter = (rnd(seed) - 0.5) * 0.3; // ±0.15V
      return +(voltageBase + voltageJitter).toFixed(3);
    
    default:
      // Default to a simple 0-100 range
      return +(rnd(seed) * 100).toFixed(2);
  }
}

function makePayload(gw: string) {
  // Get sensor config for this gateway (use default if not specified)
  const sensors = sensorConfigs[gw] || sensorConfigs.default;
  
    // Generate battery level in one of three ranges: 0-20, 20-60, or 60-100
  const batteryRangeSelector = rnd(gw.length + Date.now());
  let battery: number;
  
  if (batteryRangeSelector < 0.33) {
    // Low battery: 0-20%
    battery = Math.round(rnd(Date.now() + 1) * 20);
  } else if (batteryRangeSelector < 0.66) {
    // Medium battery: 20-60%
    battery = Math.round(20 + rnd(Date.now() + 2) * 40);
  } else {
    // High battery: 60-100%
    battery = Math.round(60 + rnd(Date.now() + 3) * 40);
  }

  
  const sensorsWithValues = sensors.map((sensor, i) => ({
    name: sensor.name,
    mac: sensor.mac,
    type: sensor.type,
    unit: sensor.unit,
    value: generateValueByType(sensor.type, i + gw.length + Date.now()),
    battery,
  }));

  return {
    gatewayId: gw,
    ts: new Date().toISOString(),
    battery,
    sensors: sensorsWithValues,
  };
}

async function publishOnce(gw: string) {
  const topic = `${gw}/data`; // your existing route_to_lambda rule listens on +/data
  const payloadObj = makePayload(gw);
  console.log(payloadObj)
  const payload = enc.encode(JSON.stringify(payloadObj));
  try {
    await client.send(new PublishCommand({ topic, qos: 0, payload, contentType: 'application/json' }));
    console.log(`[SIM] published → ${topic}`, payloadObj);
  } catch (err) {
    console.error(`[SIM] publish failed for ${gw}`, err);
  }
}

function start() {
  console.log(`[SIM] region=${region}, endpoint=${endpointHost}`);
  console.log(`[SIM] gateways=${gateways.join(', ')} rate=${rate}/s each, duration=${durationSec}s`);

  const timers: NodeJS.Timeout[] = [];

  for (const gw of gateways) {
    const t = setInterval(() => void publishOnce(gw), periodMs);
    timers.push(t);
  }

  if (durationSec > 0) {
    setTimeout(() => {
      for (const t of timers) clearInterval(t);
      console.log('[SIM] done');
      process.exit(0);
    }, durationSec * 1000);
  }
}

start();
