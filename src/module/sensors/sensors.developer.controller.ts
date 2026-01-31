import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { Types } from 'mongoose';
import { SensorsService } from './sensors.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ApiKeyAuthGuard } from '../developer/guards/api-key-auth.guard';
import { ApiTokenService } from '../developer/api-token.service';
import { Public } from '../auth/public.decorator';
import {
  DEVELOPER_API_BASE_PATH,
  DEVELOPER_API_MAX_PAGE_SIZE,
  DEVELOPER_API_DEFAULT_PAGE_SIZE,
} from '../../common/constants/developer-api.constants';

interface DeveloperApiRequest {
  developerApi: {
    orgId: Types.ObjectId;
    tokenDoc: { _id: Types.ObjectId };
  };
}

/**
 * Developer API Controller for Sensors
 * Uses API key authentication instead of Cognito JWT
 * @Public() bypasses global JwtAuthGuard, ApiKeyAuthGuard handles auth
 */
@Controller(`${DEVELOPER_API_BASE_PATH}/sensors`)
@Public()
@UseGuards(ApiKeyAuthGuard)
export class SensorsDeveloperController {
  constructor(
    private readonly sensorsService: SensorsService,
    private readonly telemetryService: TelemetryService,
    private readonly apiTokenService: ApiTokenService,
  ) { }

  /**
   * GET /api/v1/developer/sensors
   * List sensors with optional filters
   */
  @Get()
  async listSensors(
    @Query('isOnline') isOnline?: string,
    @Query('page') pageQuery?: string,
    @Query('limit') limitQuery?: string,
    @Req() req?: DeveloperApiRequest,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const orgId = req!.developerApi.orgId;
    const tokenId = req!.developerApi.tokenDoc._id;

    // Parse pagination
    const page = Math.max(1, parseInt(pageQuery || '1', 10) || 1);
    let limit = parseInt(limitQuery || String(DEVELOPER_API_DEFAULT_PAGE_SIZE), 10) || DEVELOPER_API_DEFAULT_PAGE_SIZE;
    limit = Math.min(limit, DEVELOPER_API_MAX_PAGE_SIZE);

    // Build filter options
    const opts: any = {
      page,
      limit,
      claimed: 'true', // Only claimed sensors
    };

    // Filter by online status if provided
    if (isOnline !== undefined) {
      // Will need to filter after fetching from service
    }

    const { rows, total } = await this.sensorsService.getAllSensors(orgId, opts);

    // Apply isOnline filter if provided
    let filteredRows = rows;
    if (isOnline !== undefined) {
      const isOnlineBool = isOnline === 'true';
      filteredRows = rows.filter((sensor: any) => sensor.isOnline === isOnlineBool);
    }

    // Record successful call for rate limiting analytics
    await this.apiTokenService.recordSuccessfulCall(tokenId);

    return {
      data: filteredRows.map((sensor: any) => ({
        id: sensor._id,
        mac: sensor.mac,
        displayName: sensor.displayName,
        type: sensor.type,
        isOnline: sensor.isOnline,
        lastSeen: sensor.lastSeen,
        battery: sensor.battery,
        gatewayId: sensor.gatewayId,
        createdAt: sensor.createdAt,
      })),
      pagination: {
        total: isOnline !== undefined ? filteredRows.length : total,
        page,
        limit,
        totalPages: Math.ceil((isOnline !== undefined ? filteredRows.length : total) / limit),
      },
    };
  }

  /**
   * GET /api/v1/developer/sensors/latest
   * Get latest telemetry reading for a sensor
   */
  @Get('latest')
  async getLatestReading(
    @Query('sensorId') sensorId: string,
    @Req() req?: DeveloperApiRequest,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (!sensorId) {
      throw new BadRequestException('sensorId query parameter is required');
    }

    const orgId = req!.developerApi.orgId;
    const tokenId = req!.developerApi.tokenDoc._id;

    // Normalize MAC address (uppercase)
    const normalizedSensorId = sensorId.toUpperCase();

    // Verify sensor belongs to this organization
    const sensor = await this.sensorsService.getDetails(normalizedSensorId, orgId);
    if (!sensor) {
      throw new BadRequestException(`Sensor ${sensorId} not found or does not belong to your organization`);
    }

    // Get latest telemetry reading
    const readings = await this.telemetryService.findBySensor(normalizedSensorId, {
      limit: 1,
    });

    // Record successful call for rate limiting analytics
    await this.apiTokenService.recordSuccessfulCall(tokenId);

    if (!readings || readings.length === 0) {
      return {
        sensorId: normalizedSensorId,
        displayName: sensor.displayName,
        hasData: false,
        message: 'No telemetry data available for this sensor',
      };
    }

    const latestReading = readings[0];

    return {
      sensorId: normalizedSensorId,
      displayName: sensor.displayName,
      hasData: true,
      timestamp: latestReading.ts,
      value: latestReading.value,
      unit: (latestReading as any).unit || null,
      metadata: {
        type: sensor.type,
        isOnline: sensor.isOnline,
        battery: sensor.battery,
        lastSeen: sensor.lastSeen,
      },
    };
  }
}
