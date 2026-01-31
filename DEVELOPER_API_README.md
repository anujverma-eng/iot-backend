# Motionics Cloud Developer API

> Programmatic access to sensor data via API tokens.

## Quick Start

### 1. Generate an API Token

Login to the Motionics Cloud dashboard and navigate to **Settings → Developer API**.

Click **"Generate API Key"** to create a new token. The token will only be displayed once—copy and store it securely.

```
mtnc_a1b2c3d4e5f6...
```

### 2. Make API Requests

Include your token in the `x-api-key` header:

```bash
curl -H "x-api-key: YOUR_TOKEN_HERE" \
     "https://api.iot.motionics.com/api/v1/developer/sensors"
```

---

## Authentication

| Header | Value |
|--------|-------|
| `x-api-key` | Your API token |

**Token Details:**
- **Expiry:** 15 days from creation
- **Limit:** 1 token per organization
- **Scope:** All members can generate, view, or revoke the token

---

## Rate Limits

| Limit Type | Value |
|------------|-------|
| Per Minute | 60 requests |
| Per Day | 86,400 requests |

**Response Headers:**
```
X-RateLimit-Limit-Minute: 60
X-RateLimit-Remaining-Minute: 45
X-RateLimit-Limit-Day: 86400
X-RateLimit-Remaining-Day: 85000
```

When rate limited, you'll receive a `429` response:
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded: 60 requests per minute",
  "retryAfter": 60
}
```

---

## Endpoints

### List Sensors

```http
GET /api/v1/developer/sensors
```

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `isOnline` | boolean | No | - | Filter by online status |
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 10 | Items per page (max: 20) |

**Example Request:**
```bash
curl -H "x-api-key: YOUR_TOKEN" \
     "https://api.iot.motionics.com/api/v1/developer/sensors?isOnline=true&limit=10"
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "65a1b2c3d4e5f67890abcdef",
      "mac": "94:54:93:20:D1:26",
      "displayName": "Warehouse Sensor 1",
      "type": "temperature",
      "isOnline": true,
      "lastSeen": "2025-01-31T08:30:00.000Z",
      "battery": 85,
      "gatewayId": "GW001",
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  }
}
```

---

### Get Latest Telemetry

```http
GET /api/v1/developer/sensors/latest
```

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `sensorId` | string | **Yes** | Sensor MAC address |

**Example Request:**
```bash
curl -H "x-api-key: YOUR_TOKEN" \
     "https://api.iot.motionics.com/api/v1/developer/sensors/latest?sensorId=94:54:93:20:D1:26"
```

**Example Response (with data):**
```json
{
  "sensorId": "94:54:93:20:D1:26",
  "displayName": "Warehouse Sensor 1",
  "hasData": true,
  "timestamp": "2025-01-31T08:30:00.000Z",
  "value": 23.5,
  "unit": null,
  "metadata": {
    "type": "temperature",
    "isOnline": true,
    "battery": 85,
    "lastSeen": "2025-01-31T08:30:00.000Z"
  }
}
```

**Example Response (no data):**
```json
{
  "sensorId": "94:54:93:20:D1:26",
  "displayName": "Warehouse Sensor 1",
  "hasData": false,
  "message": "No telemetry data available for this sensor"
}
```

---


## Error Responses

| Status | Description |
|--------|-------------|
| `400` | Bad request - missing or invalid parameters |
| `401` | Unauthorized - invalid or missing API key |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

**Example Error:**
```json
{
  "statusCode": 401,
  "message": "API key required. Provide x-api-key header."
}
```

---

## API Discovery

Get a JSON description of all available endpoints:

```bash
curl https://api.iot.motionics.com/api/v1/developer
```

This is a **public endpoint** that does not require authentication.
