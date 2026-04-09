// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

import { SkillsTools } from './skills.tools';

describe('SkillsTools', () => {
  let tools: SkillsTools;
  let mockLogger: { log: jest.Mock; error: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    tools = new SkillsTools(mockLogger);
  });

  describe('tool registration', () => {
    it('should register the read_skill tool', () => {
      const names = Array.from(tools.getTools().keys());
      expect(names).toContain('read_skill');
      expect(names).toHaveLength(1);
    });

    it('should have correct input schema', () => {
      const toolMap = tools.getTools();
      const readSkill = toolMap.get('read_skill')!;
      expect(readSkill.definition.inputSchema.required).toEqual(['skillName']);
      expect(readSkill.definition.inputSchema.properties).toHaveProperty(
        'skillName',
      );
    });

    it('should list available skills in the description', () => {
      const toolMap = tools.getTools();
      const readSkill = toolMap.get('read_skill')!;
      expect(readSkill.definition.description).toContain('search-queries');
    });
  });

  describe('skill loading', () => {
    it('should load skills from the skills directory', () => {
      const skillNames = tools.getAvailableSkillNames();
      expect(skillNames.length).toBeGreaterThan(0);
      expect(skillNames).toContain('search-queries');
    });

    it('should return skill contents', () => {
      const contents = tools.getSkillContents();
      expect(contents.size).toBeGreaterThan(0);
      expect(contents.has('search-queries')).toBe(true);
      expect(contents.get('search-queries')).toContain('Find Query Syntax');
    });
  });

  describe('read_skill', () => {
    function callTool(name: string, args: Record<string, unknown>) {
      const toolMap = tools.getTools();
      const tool = toolMap.get(name);
      if (!tool) throw new Error(`Tool ${name} not found`);
      return tool.handler(args, '');
    }

    it('should return skill content for a valid skill', async () => {
      const result = await callTool('read_skill', {
        skillName: 'search-queries',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Find Query Syntax');
    });

    it('should return error for unknown skill', async () => {
      const result = await callTool('read_skill', {
        skillName: 'nonexistent-skill',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown skill');
      expect(result.content[0].text).toContain('nonexistent-skill');
      expect(result.content[0].text).toContain('Available skills');
    });

    it('should return error when skillName is missing', async () => {
      const result = await callTool('read_skill', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('skillName');
    });
  });
});
