// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { Injectable, Inject } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { McpToolResult } from './tools.service';
import { ToolRegistration } from './task-helpers';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Skills Tools
 *
 * Provides the read_skill tool so MCP clients can fetch skill documents
 * (detailed syntax/usage guides) at runtime — even when the client lacks
 * native MCP resource-reading capability.
 *
 * Skills are loaded from the `skills/` directory at construction time.
 */
@Injectable()
export class SkillsTools {
  private readonly skillContents = new Map<string, string>();

  constructor(@Inject('LOGGER') private readonly logger: LoggerService) {
    this.loadSkills();
  }

  /**
   * Scan candidate directories and load every SKILL.md into memory.
   */
  private loadSkills(): void {
    const candidateDirs = [
      join(__dirname, '..', 'skills'),
      join(__dirname, '..', '..', 'skills'),
    ];
    const skillsDir = candidateDirs.find((dir) => existsSync(dir));

    if (!skillsDir) {
      this.logger.warn?.(
        `Skills directory not found (searched: ${candidateDirs.join(', ')})`,
        SkillsTools.name,
      );
      return;
    }

    const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((dir) => dir.isDirectory())
      .map((dir) => dir.name);

    for (const skillName of skillDirs) {
      const skillPath = join(skillsDir, skillName, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      this.skillContents.set(skillName, readFileSync(skillPath, 'utf-8'));
    }

    this.logger.log(
      `Loaded ${this.skillContents.size} skills from ${skillsDir}`,
      SkillsTools.name,
    );
  }

  /**
   * Return the loaded skill content map — used by main.ts to register
   * MCP resources, and internally by the read_skill tool handler.
   */
  public getSkillContents(): Map<string, string> {
    return this.skillContents;
  }

  /**
   * Return the list of available skill names.
   */
  public getAvailableSkillNames(): string[] {
    return Array.from(this.skillContents.keys());
  }

  public getTools(): Map<string, ToolRegistration> {
    const tools = new Map<string, ToolRegistration>();
    const availableSkills = this.getAvailableSkillNames();

    tools.set('read_skill', {
      definition: {
        name: 'read_skill',
        description:
          'Read a P4 Plan skill document. Skills provide detailed syntax and usage guides. ' +
          'You MUST call this with skillName="search-queries" before composing any findQuery for search_tasks. ' +
          `Available skills: ${availableSkills.join(', ')}`,
        inputSchema: {
          type: 'object',
          properties: {
            skillName: {
              type: 'string',
              description: `Name of the skill to read. Available: ${availableSkills.join(', ')}`,
            },
          },
          required: ['skillName'],
        },
      },
      handler: (args) => this.readSkill(args),
    });

    return tools;
  }

  private readSkill(args: Record<string, unknown>): McpToolResult {
    const skillName = args.skillName as string;

    if (!skillName) {
      return {
        content: [{ type: 'text', text: "Error: 'skillName' is required" }],
        isError: true,
      };
    }

    const content = this.skillContents.get(skillName);
    if (!content) {
      const availableSkills = this.getAvailableSkillNames();
      return {
        content: [
          {
            type: 'text',
            text: `Unknown skill "${skillName}". Available skills: ${availableSkills.join(', ')}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text', text: content }],
      isError: false,
    };
  }
}
