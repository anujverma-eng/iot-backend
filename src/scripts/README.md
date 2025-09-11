# Scripts Directory

This directory contains various scripts for seeding data, migrations, and IoT simulation.

## Available Scripts

### Seeding Scripts
- `npm run seed:plans` - Seeds the plans collection with default plan data
- `npm run seed:telemetry` - Seeds telemetry data for testing  
- `npm run seed:org-gateway` - Seeds organizations and gateways

### Migration Scripts
- `npm run migrate:owner-memberships` - Creates membership records for existing owner users who don't have memberships

### Simulation Scripts
- `npm run sim:iot` - Runs the IoT device simulator

---

# IoT Simulator

This directory contains scripts and services for simulating IoT device data transmission to test your IoT pipeline.

## Quick Start

### 1. Environment Variables

Ensure your `.env` file contains the following IoT simulator configuration:

```bash
# IoT Simulator Configuration
IOT_ENDPOINT_HOST=a2r71vab5hezzm-ats.iot.us-east-1.amazonaws.com
SIM_GATEWAYS=gw_81978fa4,gw_2ff66d48,gw_f5dab0e0
SIM_RATE=1
SIM_DURATION=0
```

### 2. Run the Standalone Script

```bash
# Using default environment variables from .env
npm run sim:iot

# Or override specific variables
SIM_GATEWAYS=gw_test123,gw_test456 SIM_RATE=2 SIM_DURATION=10 npm run sim:iot
```

### 3. Use the NestJS Service

The simulator is also available as a NestJS service that can be controlled via API endpoints:

**Start Simulator (with default sensors):**
```bash
curl -X POST http://localhost:3000/iot/simulator/start \
  -H "Content-Type: application/json" \
  -d '{"gateways": ["gw_test123", "gw_test456"], "intervalSeconds": 10}'
```

**Start Simulator with Custom Sensor Configuration:**
```bash
curl -X POST http://localhost:3000/iot/simulator/start-with-config \
  -H "Content-Type: application/json" \
  -d '{
    "intervalSeconds": 10,
    "gatewayConfigs": [
      {
        "gatewayId": "gw_test123",
        "sensors": [
          {
            "name": "PressureSensor01",
            "mac": "AA:BB:CC:DD:EE:FF",
            "type": "pressure",
            "unit": "psi"
          },
          {
            "name": "TempSensor01",
            "mac": "11:22:33:44:55:66",
            "type": "temperature",
            "unit": "°C"
          }
        ]
      }
    ]
  }'
```

**Configure Sensors (without starting):**
```bash
curl -X POST http://localhost:3000/iot/simulator/config \
  -H "Content-Type: application/json" \
  -d '{
    "gatewayConfigs": [
      {
        "gatewayId": "gw_test123",
        "sensors": [
          {
            "name": "CustomSensor",
            "mac": "AA:BB:CC:DD:EE:FF",
            "type": "humidity",
            "unit": "%"
          }
        ]
      }
    ]
  }'
```

**Stop Simulator:**
```bash
curl -X DELETE http://localhost:3000/iot/simulator/stop
```

## Configuration

- **IOT_ENDPOINT_HOST**: Your AWS IoT Core endpoint hostname
- **SIM_GATEWAYS**: Comma-separated list of gateway IDs to simulate
- **SIM_RATE**: Messages per second per gateway (default: 1) - **Note: This is for the standalone script only**
- **SIM_DURATION**: How long to run in seconds (0 = run forever)

### API Parameters

- **intervalSeconds**: How often to publish messages (in seconds). Default: 1 second
  - `intervalSeconds: 1` = publish every 1 second
  - `intervalSeconds: 10` = publish every 10 seconds
  - `intervalSeconds: 60` = publish every 1 minute

## Sensor Configuration

### Sensor Types and Value Generation

The simulator supports different sensor types with realistic value generation:

| Type | Value Range | Description |
|------|-------------|-------------|
| `pressure` | ~0.09 psi ±0.005 | Realistic pressure sensor readings |
| `temperature` | 25°C ±5°C | Temperature readings |
| `humidity` | 55% ±15% | Humidity percentage (0-100%) |
| `voltage` | 3.15V ±0.15V | Typical sensor voltage readings |
| `custom` | 0-100 | Default range for unknown types |

### Custom Sensor Configuration

You can configure specific sensors for each gateway by providing:

```json
{
  "gatewayId": "gw_123",
  "sensors": [
    {
      "name": "Your sensor name",
      "mac": "AA:BB:CC:DD:EE:FF",
      "type": "pressure|temperature|humidity|voltage|custom",
      "unit": "psi|°C|%|V|custom_unit"
    }
  ]
}
```

**Note**: The simulator only generates the `value` field based on the sensor `type`. All other fields (name, mac, type, unit) come from your configuration.

## Message Format

The simulator generates messages in this format:

```json
{
  "gatewayId": "gw_81978fa4",
  "ts": "2025-08-16T10:30:00.000Z",
  "sensors": [
    {
      "name": "PressureSensor01",
      "mac": "AA:BB:CC:DD:EE:FF",
      "type": "pressure",
      "unit": "psi",
      "value": 0.0914286,
      "battery": 75,
    },
    {
      "name": "TempSensor01",
      "mac": "11:22:33:44:55:66",
      "type": "temperature",
      "unit": "°C",
      "value": 24.5,
      "battery": 75,
    }
  ]
}
```

### Battery Field

The `battery` field represents the gateway's battery level as a percentage (0-100%). The simulator randomly selects one of three battery level ranges:

- **Low battery**: 0-20% (33% chance)
- **Medium battery**: 20-60% (33% chance)  
- **High battery**: 60-100% (33% chance)

## IAM Permissions

Ensure your AWS credentials have the `iot:Publish` permission for topics like:
- `arn:aws:iot:us-east-1:199472244724:topic/gw_*`

## Topics

Messages are published to: `{gatewayId}/data`

For example: `gw_81978fa4/data`
