/**
 * Central Winston transport/format factory.
 * We keep it separate so tests or future Lambdas can reuse it.
 */
import { utilities as nestFormat } from 'nest-winston';
import { format, transports } from 'winston';
import type { ConfigService } from '@nestjs/config';

export const buildWinstonOptions = (config: ConfigService) => {
  const logLevel = config.get<string>('logLevel') ?? 'debug';

  return {
    level: logLevel,
    transports: [
      new transports.Console({
        format: format.combine(
          format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          // Colorize only in non‑prod for readability:
          format.colorize({ all: process.env.NODE_ENV !== 'production' }),
          nestFormat.format.nestLike(),
        ),
      }),
      // 👉 Add file, CloudWatch, etc., here when needed
    ],
  };
};
