import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  DEVELOPER_API_BASE_PATH,
  DEVELOPER_API_MAX_PAGE_SIZE,
  DEVELOPER_API_DEFAULT_PAGE_SIZE,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_RATE_LIMIT_PER_DAY,
  TOKEN_EXPIRY_DAYS,
} from '../../common/constants/developer-api.constants';
import { ConfigService } from '@nestjs/config';
/**
 * Public Developer API discovery endpoint
 * No authentication required - provides API contracts
 */
@Controller(DEVELOPER_API_BASE_PATH)
export class DeveloperController {
  private readonly frontendBaseUrl: string;
  constructor(
    private readonly config: ConfigService,
  ) {
    const baseUrl = this.config.get('app.frontendUrl') || 'http://localhost:3001';
    this.frontendBaseUrl = baseUrl;
  }
  @Public()
  @Get()
  getApiContracts() {
    return {
      name: 'Motionics Cloud Developer API',
      version: 'v1',
      description: 'Programmatic access to sensor data via API tokens',
      documentation: `${this.frontendBaseUrl}/api-documentation`,

      authentication: {
        type: 'API Key',
        header: 'x-api-key',
        expiryDays: TOKEN_EXPIRY_DAYS,
        usage: 'Include your API key in the x-api-key header for all requests',
      },

      tokenManagement: {
        note: 'Use the main Motionics Cloud dashboard to generate and manage your API token',
        url: `${this.frontendBaseUrl}/dashboard/settings`
      },

      rateLimits: {
        perMinute: DEFAULT_RATE_LIMIT_PER_MINUTE,
        perDay: DEFAULT_RATE_LIMIT_PER_DAY,
        note: 'Rate limits are included in response headers: X-RateLimit-Limit-Minute, X-RateLimit-Remaining-Minute, X-RateLimit-Limit-Day, X-RateLimit-Remaining-Day',
      },

      endpoints: [
        {
          method: 'GET',
          path: '/api/v1/developer/sensors',
          description: 'List sensors for your organization',
          authentication: 'Required (x-api-key)',
          queryParams: {
            isOnline: {
              type: 'boolean',
              required: false,
              description: 'Filter by online status (true/false)',
            },
            page: {
              type: 'number',
              required: false,
              default: 1,
              description: 'Page number',
            },
            limit: {
              type: 'number',
              required: false,
              default: DEVELOPER_API_DEFAULT_PAGE_SIZE,
              max: DEVELOPER_API_MAX_PAGE_SIZE,
              description: 'Items per page (max 20)',
            },
          },
          response: {
            data: '[Array of sensor objects]',
            pagination: {
              total: 'number',
              page: 'number',
              limit: 'number',
              totalPages: 'number',
            },
          },
        },
        {
          method: 'GET',
          path: '/api/v1/developer/sensors/latest',
          description: 'Get latest telemetry reading for a sensor',
          authentication: 'Required (x-api-key)',
          queryParams: {
            sensorId: {
              type: 'string',
              required: true,
              description: 'Sensor MAC address (e.g., 94:54:93:20:D1:26)',
            },
          },
          response: {
            sensorId: 'string',
            timestamp: 'ISO date string',
            value: 'number',
            unit: 'string',
            metadata: 'object',
          },
        },
      ],

      errorResponses: {
        401: 'Unauthorized - Invalid or missing API key',
        429: 'Rate limit exceeded',
        400: 'Bad request - Invalid parameters',
        404: 'Resource not found',
      },
    };
  }
}
