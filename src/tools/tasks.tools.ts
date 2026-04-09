// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLClientService } from '../graphql-client/graphql-client.service';
import { ToolRegistration } from './task-helpers';
import { TaskCrudTools } from './task-crud.tools';
import { TaskItemsTools } from './task-items.tools';
import { TaskCommentsTools } from './task-comments.tools';
import { TaskCustomFieldsTools } from './task-custom-fields.tools';
import { TaskActionsTools } from './task-actions.tools';
import { TaskLinksTools } from './task-links.tools';

/**
 * Tasks Tools
 *
 * Aggregates all task-related tools from specialized sub-modules:
 * - TaskCrudTools: Core CRUD operations (get, search, create_item, update)
 * - TaskItemsTools: Listing operations (my tasks, bugs, backlog, scheduled)
 * - TaskCommentsTools: Comments and attachments
 * - TaskCustomFieldsTools: Custom fields and workflows
 * - TaskActionsTools: Actions (commit to sprint, assign, update sprint, uncommit)
 * - TaskLinksTools: Item link management (internal and external links)
 */
@Injectable()
export class TasksTools {
  private readonly crudTools: TaskCrudTools;
  private readonly itemsTools: TaskItemsTools;
  private readonly commentsTools: TaskCommentsTools;
  private readonly customFieldsTools: TaskCustomFieldsTools;
  private readonly actionsTools: TaskActionsTools;
  private readonly linksTools: TaskLinksTools;

  constructor(
    private readonly graphqlClient: GraphQLClientService,
    private readonly configService: ConfigService,
  ) {
    // Initialize all sub-tool providers
    this.crudTools = new TaskCrudTools(this.graphqlClient, this.configService);
    this.itemsTools = new TaskItemsTools(this.graphqlClient);
    this.commentsTools = new TaskCommentsTools(this.graphqlClient);
    this.customFieldsTools = new TaskCustomFieldsTools(this.graphqlClient);
    this.actionsTools = new TaskActionsTools(this.graphqlClient);
    this.linksTools = new TaskLinksTools(this.graphqlClient);
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();

    // Aggregate tools from all sub-modules
    this.crudTools.getTools().forEach((tool, name) => tools.set(name, tool));
    this.itemsTools.getTools().forEach((tool, name) => tools.set(name, tool));
    this.commentsTools
      .getTools()
      .forEach((tool, name) => tools.set(name, tool));
    this.customFieldsTools
      .getTools()
      .forEach((tool, name) => tools.set(name, tool));
    this.actionsTools.getTools().forEach((tool, name) => tools.set(name, tool));
    this.linksTools.getTools().forEach((tool, name) => tools.set(name, tool));

    return tools;
  }
}
