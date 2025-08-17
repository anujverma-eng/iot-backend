# Example Sensor Configurations

## For Standalone Script

You can define custom sensor configurations by setting the `SENSOR_CONFIG_JSON` environment variable:

```bash
export SENSOR_CONFIG_JSON='{
  "default": [
    {
      "name": "DefaultPressure",
      "mac": "94:54:93:20:D1:26",
      "type": "pressure",
      "unit": "psi"
    }
  ],
  "gw_factory01": [
    {
      "name": "FactoryPressure01",
      "mac": "AA:BB:CC:DD:EE:01",
      "type": "pressure",
      "unit": "psi"
    },
    {
      "name": "FactoryTemp01", 
      "mac": "AA:BB:CC:DD:EE:02",
      "type": "temperature",
      "unit": "°C"
    },
    {
      "name": "FactoryHumidity01",
      "mac": "AA:BB:CC:DD:EE:03", 
      "type": "humidity",
      "unit": "%"
    }
  ],
  "gw_warehouse02": [
    {
      "name": "WarehouseVoltage01",
      "mac": "BB:CC:DD:EE:FF:01",
      "type": "voltage", 
      "unit": "V"
    },
    {
      "name": "WarehouseTemp01",
      "mac": "BB:CC:DD:EE:FF:02",
      "type": "temperature",
      "unit": "°C"
    }
  ]
}'

# Then run the simulator
SIM_GATEWAYS=gw_factory01,gw_warehouse02 npm run sim:iot
```

## For NestJS API

Use the `/iot/simulator/start-with-config` endpoint:

```json
{
  "intervalSeconds": 10,
  "gatewayConfigs": [
    {
      "gatewayId": "gw_factory01",
      "sensors": [
        {
          "name": "FactoryPressure01",
          "mac": "AA:BB:CC:DD:EE:01",
          "type": "pressure",
          "unit": "psi"
        },
        {
          "name": "FactoryTemp01",
          "mac": "AA:BB:CC:DD:EE:02", 
          "type": "temperature",
          "unit": "°C"
        }
      ]
    },
    {
      "gatewayId": "gw_warehouse02",
      "sensors": [
        {
          "name": "WarehouseVoltage01",
          "mac": "BB:CC:DD:EE:FF:01",
          "type": "voltage",
          "unit": "V"
        }
      ]
    }
  ]
}
```

## Supported Sensor Types

- **pressure**: Generates values around 0.09 psi with small variations
- **temperature**: Generates values around 25°C with ±5°C variations  
- **humidity**: Generates values around 55% with ±15% variations (0-100%)
- **voltage**: Generates values around 3.15V with ±0.15V variations
- **custom**: Generates random values 0-100 for unknown types
