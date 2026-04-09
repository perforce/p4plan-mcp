---
name: p4-plan-project-navigation
description: Navigate P4 Plan projects, discover items, search, and filter. Use when user mentions projects, navigation, finding items, project structure, getting started, search, find, filter, or report.
---

# Project Navigation in P4 Plan

## Key Concepts

Every project has **three sections**, each with a different ID:

| Section      | Contains                          | ID Source                       |
|--------------|-----------------------------------|---------------------------------|
| **Planning** | Sprints, ScheduledTasks, Releases | project.id (same as project ID) |
| **Backlog**  | BacklogTasks, User Stories        | project.backlogID               |
| **QA**       | Bugs                              | project.qaID                    |

Call get_project(projectId) to retrieve backlogID and qaID. Most tools accept the project ID directly and resolve the correct section internally.

## Filter Values Quick Reference

**Status**: notDone, inProgress, completed, blocked
**Backlog priority**: veryHigh, high, medium, low, veryLow, none
**Bug severity**: A (critical), B (high), C (medium), D (low), none

## Tool Mapping

| User Intent                       | Tool               | Key Parameters                       |
|-----------------------------------|--------------------|--------------------------------------|
| List all projects                 | list_projects      | (none)                               |
| Get project details + section IDs | get_project        | projectId                            |
| Get current user info             | get_current_user   | (none)                               |
| List project team members         | list_project_users | projectId                            |
| See my assigned work (To Do List) | get_my_tasks       | showCompleted, showOnlyNextFourWeeks, showPipelineTasksThatCannotStart |
| Search by name                    | search_tasks       | findQuery, projectId, limit          |
| Get any item's full details       | get_tasks          | taskIds                              |
| Read custom field values          | get_custom_fields  | taskId, onlySet                      |

## Typical Starting Sequence

1. list_projects() -- find the project
2. get_project(projectId) -- get section IDs
3. Use search_tasks or get_my_tasks to find items, then get_tasks for details

## Related Skills

- [Task Management](../task-management/SKILL.md) -- working with individual tasks
- [Backlog Grooming](../backlog-refinement/SKILL.md) -- backlog section
- [Bug Tracking](../bug-tracking/SKILL.md) -- QA section