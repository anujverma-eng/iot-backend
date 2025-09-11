import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  MONGO_URI: Joi.string().uri().required(),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('debug'),
  COGNITO_REGION: Joi.string().required(),
  COGNITO_USER_POOL_ID: Joi.string().required(),
  COGNITO_APP_CLIENT_ID: Joi.string().required(),
  COGNITO_DOMAIN: Joi.string().required(),
  COGNITO_IDENTITY_POOL_ID: Joi.string().required(),
  IOT_ENDPOINT: Joi.string(),
  IOT_VIEWER_ROLE_ARN: Joi.string().required(),
  // SES Configuration
  SES_REGION: Joi.string().default('us-east-1'),
  SES_FROM_EMAIL: Joi.string().email().required(),
  SES_CONFIG_SET: Joi.string().optional(),
  // Frontend URL for invite links
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),
});
