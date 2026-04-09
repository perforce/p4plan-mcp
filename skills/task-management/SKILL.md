---
name: p4-plan-task-management
description: Manage tasks, status updates, assignments, comments, and attachments in P4 Plan. Use when user mentions tasks, status, updates, assignments, my work, todo list, assign, comments, attachments, or collaboration.
---

# Task Management in P4 Plan

The **To Do List** (get_my_tasks) shows all tasks, items, and bugs assigned to the current user across projects.

## Key Concepts

- **Status values**: notDone, inProgress, completed, blocked
- **Percent complete**: 0-100. Setting to 100 auto-completes. Used mainly for scheduled tasks.
- **Work remaining**: Hours left on a backlog task. Setting to 0 auto-completes.
- **Workflow status**: Some tasks have custom workflow statuses beyond the basic four. Check task.workflow and task.workflowStatus.
- **Task types**: BacklogTask (backlog), ScheduledTask (planning/Gantt), Bug (QA). All share the same status, assignment, and comment tools.
- **Multi-assignment**: Multiple users can be assigned to one task. update_item assignedTo replaces existing assignees — include existing ones to add. Each entry supports optional percentageAllocation (default: 100).
- **Sprint constraint**: When assigning a task in a sprint, the assignee must already be a sprint member.
- **Links**: Items can link to other items (blocks, duplicates, related) or to external URLs. Use get_tasks to see existing links.

## Tool Mapping

| User Intent                   | Tool                | Key Parameters                                               |
|-------------------------------|---------------------|--------------------------------------------------------------|
| See my assigned work          | get_my_tasks        | showCompleted, showOnlyNextFourWeeks, showPipelineTasksThatCannotStart |
| Get full task details & links | get_tasks           | taskIds                                                      |
| Start working on task         | start_task          | taskId                                                       |
| Complete a task               | complete_task       | taskId                                                       |
| Mark task blocked             | update_item         | itemId, status: "blocked"                                    |
| Update progress %             | update_item         | itemId, percentCompleted                                     |
| Update work remaining         | update_item         | itemId, workRemaining                                        |
| Update multiple fields        | update_item         | itemId, name, status, points, priority, etc.                 |
| Assign to user(s)             | update_item         | itemId, assignedTo: [{ userID, percentageAllocation? }]      |
| Get current user info         | get_current_user    | (none)                                                       |
| List project team members     | list_project_users  | projectId                                                    |
| Post comment                  | post_comment        | taskId, text                                                 |
| Edit a comment                | update_comment      | taskId, commentId, text                                      |
| Delete a comment              | delete_comment      | taskId, commentId                                            |
| Read discussion               | get_comments        | taskId                                                       |
| List attached files           | get_attachments     | taskId                                                       |
| Download/view a file          | download_attachment | taskId, path (from get_attachments)                          |
| Remove an attachment          | delete_attachment   | taskId, path                                                 |
| Set cover image               | set_cover_image     | taskId, imagePath (null to remove)                           |
| Link item to item             | link_items          | fromItemId, toItemId, relation (blocks/duplicates/relatedTo) |
| Link item to URL              | link_items          | fromItemId, url, relation, notes?                            |
| Remove a link                 | unlink_items        | fromItemId, toItemId or url                                  |
| Search for tasks              | search_tasks        | findQuery, projectId                                         |

### File type support for `download_attachment`

| Type        | Returned as        | Examples                                                 |
|-------------|--------------------|----------------------------------------------------------|
| Text & code | Raw text inline    | .txt, .md, .csv, .json, .xml, .js, .ts, .py, .yaml, .svg |
| Images      | MCP image (vision) | .png, .jpg, .gif, .webp                                  |
| Binary docs | Not readable       | .pdf, .docx, .xlsx, .pptx, .zip                          |

## Committed Items

Items with a `committedToProjectID` are already committed to a sprint. Before modifying, moving, or breaking down committed items, always confirm with the user first. When creating sub-tasks under a committed parent (`parentItemId`), call `get_tasks` on the parent first — if it has `committedToProjectID`, ask the user whether the sub-items should be created in the sprint or in the backlog.

## Related Skills

- [Bug Tracking](../bug-tracking/SKILL.md) -- bug-specific fields and workflows
- [Planning](../planning/SKILL.md) -- sprints and releases
- [Workflows](../workflows/SKILL.md) -- custom workflow statuses