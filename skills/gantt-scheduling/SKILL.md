---
name: p4-plan-gantt-scheduling
description: Guide Gantt chart scheduling, scheduled tasks, dependencies, and timeline planning in P4 Plan. Use when user mentions Gantt, scheduling, timeline, dependencies, duration, start date, end date, or waterfall.
---

# Gantt Scheduling in P4 Plan

P4 Plan supports Gantt scheduling for traditional project planning with timelines and task dependencies. Scheduled tasks live in the **Planning** section.

## Key Concepts

- **Scheduled task**: A time-boxed item with start date, finish date, duration, and optional dependencies.
- **Dependency types**: End-to-Start (most common), Start-to-Start, End-to-End, Start-to-End.
- **Percent complete**: Progress tracking (0-100). Setting to 100 auto-completes.
- **Estimated days**: Effort estimate (can differ from calendar duration).
- Planning items include ScheduledTask, Sprint, and Release types.

## Tool Mapping

| User Intent                    | Tool               | Key Parameters                                                        |
|--------------------------------|--------------------|-----------------------------------------------------------------------|
| Create scheduled task          | create_item        | type: "scheduled_task", projectId, name, estimatedDays, start, finish |
| Create sub-task                | create_item        | type: "scheduled_task", projectId, name, parentItemId                 |
| Insert after an item           | create_item        | type: "scheduled_task", projectId, name, previousItemId               |
| Find planning items            | search_tasks       | findQuery, projectId                                                  |
| Get task details (dates, deps) | get_tasks          | taskIds                                                               |
| Update progress                | update_item        | itemId, percentCompleted                                              |
| Update effort estimate         | update_item        | itemId, estimatedDays                                                 |
| Assign to user                 | update_item        | itemId, assignedTo: [{ userID }]                                      |
| Start task                     | start_task         | taskId                                                                |
| Complete task                  | complete_task      | taskId                                                                |
| Get team members               | list_project_users | projectId                                                             |

## Related Skills

- [Planning](../planning/SKILL.md) -- sprints and releases in the Planning section
- [Backlog Grooming](../backlog-refinement/SKILL.md) -- backlog items before scheduling