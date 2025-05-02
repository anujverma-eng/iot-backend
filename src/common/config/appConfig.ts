export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongo: {
    uri: process.env.MONGO_URI,
  },
  logLevel: process.env.LOG_LEVEL ?? 'debug',
});
