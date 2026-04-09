// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Agent } from 'https';
import { GraphQLClientService } from './graphql-client.service';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        httpsAgent: configService.get<boolean>('allowSelfSignedCerts')
          ? new Agent({ rejectUnauthorized: false })
          : undefined,
      }),
    }),
  ],
  providers: [GraphQLClientService],
  exports: [GraphQLClientService],
})
export class GraphQLClientModule {}
