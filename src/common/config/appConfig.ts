export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongo: {
    uri: process.env.MONGO_URI,
  },
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  cognito: {
    region     : process.env.COGNITO_REGION,
    userPoolId : process.env.COGNITO_USER_POOL_ID,
    clientId   : process.env.COGNITO_APP_CLIENT_ID,
    domain     : process.env.COGNITO_DOMAIN,
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    accessSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    certBucket: process.env.AWS_CERT_BUCKET
  },
});
