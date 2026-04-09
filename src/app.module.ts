// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from './logger/logger.module';
import { GraphQLClientModule } from './graphql-client/graphql-client.module';
import { ToolsModule } from './tools/tools.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [configuration],
    }),
    LoggerModule,
    GraphQLClientModule,
    ToolsModule,
  ],
})
export class AppModule {}
