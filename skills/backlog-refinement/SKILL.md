---
name: p4-plan-backlog-refinement
description: Guide backlog refinement sessions, story refinement, estimation, and prioritization in P4 Plan. Use when user mentions backlog, refinement, estimation, story points, or prioritization.
---

# Backlog refinement in P4 Plan

The **Product Backlog** is a dedicated section containing user stories and tasks not yet scheduled into sprints.

## Key Concepts

- **User Story**: High-level feature/epic in the backlog. Can have children (sub-stories or tasks).
- **Backlog Item** (BacklogTask): Actionable work task. Leaf-level work.
- **Backlog priority**: Relative ordering. Values: veryHigh, high, medium, low, veryLow, none
- **Points**: Story point estimates (numeric).
- **Estimated days**: Day-based estimates (alternative to points).

## Tool Mapping

| User Intent             | Tool             | Key Parameters                                        |
|-------------------------|------------------|-------------------------------------------------------|
| Find backlog items      | search_tasks     | findQuery, projectId                                  |
| Create a backlog item   | create_item      | type: "backlog_task", projectId, name                 |
| Create a sub-task       | create_item      | type: "backlog_task", projectId, name, parentItemId   |
| Insert after an item    | create_item      | type: "backlog_task", projectId, name, previousItemId |
| Set priority            | update_item      | itemId, priority                                      |
| Estimate in points      | update_item      | itemId, points                                        |
| Estimate in days        | update_item      | itemId, estimatedDays                                 |
| Get full item details   | get_tasks        | taskIds                                               |
| Add acceptance criteria | post_comment     | taskId, text                                          |
| Move item to sprint     | commit_to_sprint | taskId, sprintId                                      |

## Committed Items

Items with a `committedToProjectID` are already committed to a sprint. Before modifying, moving, or breaking down committed items, always confirm with the user first. When creating sub-tasks under a committed parent (`parentItemId`), call `get_tasks` on the parent first — if it has `committedToProjectID`, ask the user whether the sub-items should be created in the sprint or in the backlog.

## Related Skills

- [Planning](../planning/SKILL.md) -- committing backlog items to sprints
- [Bug Tracking](../bug-tracking/SKILL.md) -- bugs in QA section