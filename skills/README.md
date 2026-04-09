# P4 Plan Agent Skills

Skills provide domain knowledge that helps AI agents pick the right MCP tool for a given user intent.

## Skills

```
skills/
├── README.md
├── project-navigation/SKILL.md   # Projects, search, filtering, getting started
├── search-queries/SKILL.md       # P4 Plan Find query syntax for advanced searching
├── task-management/SKILL.md      # Task CRUD, status, assignments, comments, attachments
├── planning/SKILL.md             # Sprints, releases, commitment, allocations
├── backlog-refinement/SKILL.md     # Backlog items, estimation, prioritization
├── bug-tracking/SKILL.md         # Bugs, severity, QA section
├── custom-fields/SKILL.md        # Custom columns, project-specific metadata
├── gantt-scheduling/SKILL.md     # Scheduled tasks, timeline, dependencies
└── workflows/SKILL.md            # Workflows, pipelines, status state machines
```

## Skill Descriptions

| Skill                  | Trigger Phrases                                                                |
|------------------------|--------------------------------------------------------------------------------|
| **project-navigation** | projects, navigation, structure, getting started, search, find, filter, report |
| **search-queries**     | advanced search, find query, filter by status/assignee/severity/dates/type     |
| **task-management**    | tasks, status, my work, To Do List, assign, comments, attachments, download    |
| **planning**           | sprint, planning, capacity, velocity, burndown, release, milestone, version    |
| **backlog-refinement** | backlog, refinement, estimation, story points, prioritization                  |
| **bug-tracking**       | bugs, triage, severity, QA, defects, create bug, screenshots                   |
| **custom-fields**      | custom fields, columns, metadata                                               |
| **gantt-scheduling**   | Gantt, schedule, timeline, dependencies                                        |
| **workflows**          | workflow, pipeline, sign-off, approval                                         |

## Using Skills with AI Agents

Skills are accessible in two built-in ways, plus manual options for specific clients.

### Via `read_skill` Tool (recommended)

The MCP server provides a `read_skill` tool that any MCP client can call to fetch skill content at runtime. This works with all clients — no resource-reading capability required.

```
read_skill(skillName="search-queries")
```

The AI agent is instructed to call `read_skill` with `skillName="search-queries"` before composing any `findQuery` for `search_tasks`.

### Via MCP Resources

Skills are also registered as MCP resources for clients that support native resource reading. Resource URIs follow the pattern: `skill://p4-plan/<skill-name>`

For example: `skill://p4-plan/task-management`, `skill://p4-plan/bug-tracking`

> **Note:** Many MCP clients do not yet support resource reading. The `read_skill` tool provides the same content and works universally.

### VS Code Copilot

Add the skills directory as custom instructions. In `.vscode/settings.json`:

```json
{
  "chat.instructionFiles": [
    "Projects/ProjectManager/Web/MCP/skills/*/SKILL.md"
  ]
}
```

Or reference individual skills via `#instructions` in chat.

### Claude Code

Copy or symlink the skills directory into your project's `.claude/skills/`:

```bash
# From your project root
mkdir -p .claude/skills
cp -r /path/to/Web/MCP/skills/*/ .claude/skills/
```

Claude Code automatically discovers SKILL.md files in `.claude/skills/`.

### Claude Desktop / Claude.ai

Attach individual SKILL.md files as project knowledge, or paste the relevant skill content into your project instructions.

### Cursor / Windsurf / Other MCP Clients

Add the SKILL.md contents to your agent's system prompt or rules file. For Cursor, add to `.cursor/rules/`:

```bash
cp /path/to/Web/MCP/skills/*/SKILL.md .cursor/rules/
```

### Manual / API Usage

Skills are standalone Markdown. Include the content of relevant SKILL.md files in any system prompt alongside MCP tool definitions to improve tool selection accuracy.

## Adding New Skills

1. Create a directory: `mkdir skills/my-new-skill`
2. Add a `SKILL.md` with YAML frontmatter (`name`, `description`) and a tool mapping table.
3. Keep under 50 lines — only include info that helps an AI agent select the right tool.