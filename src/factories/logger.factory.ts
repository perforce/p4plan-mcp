// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston/dist/winston.utilities';
import { LoggerService } from '@nestjs/common';

export const loggerFactory: LoggerService = WinstonModule.createLogger({
  level: process.env.LOG_LEVEL ?? 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.ms(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      // Only show warnings and errors on stderr (VS Code labels all stderr as [warning])
      // Full debug logs are captured in the File transport below
      level: 'warn',
      stderrLevels: Object.keys(winston.config.npm.levels),
      format: winston.format.combine(
        nestWinstonModuleUtilities.format.nestLike('P4Plan-MCP', {
          colors: false,
          prettyPrint: true,
        }),
      ),
    }),
    new winston.transports.File({
      filename: `.logs/P4PlanMCP_${new Date()
        .toISOString()
        .slice(0, 19)
        .replaceAll(':', '.')}.log`,
      format: winston.format.combine(
        nestWinstonModuleUtilities.format.nestLike('P4Plan-MCP', {
          colors: false,
          prettyPrint: true,
        }),
      ),
    }),
  ],
});
