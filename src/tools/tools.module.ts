// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { ProjectsTools } from './projects.tools';
import { TasksTools } from './tasks.tools';
import { UsersTools } from './users.tools';
import { SkillsTools } from './skills.tools';

@Module({
  providers: [ToolsService, ProjectsTools, TasksTools, UsersTools, SkillsTools],
  exports: [ToolsService, SkillsTools],
})
export class ToolsModule {}
