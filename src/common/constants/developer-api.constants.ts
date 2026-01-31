/**
 * Developer API Constants
 * Configuration for API token limits and rate limiting
 */

/**
 * Maximum number of active API tokens per organization
 * Can be increased for paid tiers in the future
 */
export const MAX_TOKENS_PER_ORG = 1;

/**
 * Token expiry duration in days
 */
export const TOKEN_EXPIRY_DAYS = 7;

/**
 * Token prefix for easy identification
 * Format: mtnc_{random_hex}
 */
export const TOKEN_PREFIX = 'mtnc_';

/**
 * Default rate limits for Developer API
 * These can be overridden per-token for future paid tiers
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 20;
export const DEFAULT_RATE_LIMIT_PER_DAY = 10_000; // 86,400

/**
 * Maximum page size for Developer API list endpoints
 */
export const DEVELOPER_API_MAX_PAGE_SIZE = 20;
export const DEVELOPER_API_DEFAULT_PAGE_SIZE = 10;

/**
 * API version prefix for Developer API routes
 */
export const DEVELOPER_API_VERSION = 'v1';
export const DEVELOPER_API_BASE_PATH = `api/${DEVELOPER_API_VERSION}/developer`;
