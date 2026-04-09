// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Global, Module } from '@nestjs/common';
import { loggerFactory } from '../factories/logger.factory';

@Global()
@Module({
  providers: [
    {
      provide: 'LOGGER',
      useValue: loggerFactory,
    },
  ],
  exports: ['LOGGER'],
})
export class LoggerModule {}
