---
name: p4-plan-planning
description: Manage sprints, releases, and sprint commitment in P4 Plan. Use when user mentions sprints, sprint planning, capacity, velocity, committing work, iterations, burndown, releases, milestones, versions, or tagging.
---

# Planning in P4 Plan

The **Planning** section contains sprints, scheduled tasks, and releases.

## Sprints

- To find sprints: call search_tasks with findQuery e.g. Itemname:Text("Sprint 1"), or use get_tasks on a known sprint ID.
- **Committing**: Moves a backlog item into a sprint via commit_to_sprint.
- **Sprint allocations**: Each sprint has its own member list (subset of project members) with allocation percentages (1-125%).
- **Important**: When assigning a task in a sprint, the assignee must already be a sprint member. Use update_item to add members first.
- **Sprint priority**: Separate from backlog priority. Controls ordering within the sprint.
- Sprints show burndown charts when items have points, estimatedDays, or workRemaining set.

## Releases
- Releases (milestones) represent significant dates. Items are **tagged** to releases to track what ships in each version.
- To find releases: call search_tasks with findQuery e.g. Itemtype="Release", or use get_tasks on a known release ID.
- Release status is **derived** automatically from the status of its tagged items.
- Tags on parent items are inherited by children; child tags override parent tags.

## Tool Mapping

| User Intent                       | Tool                 | Key Parameters                                           |
|-----------------------------------|----------------------|----------------------------------------------------------|
| Find sprints or releases          | search_tasks         | findQuery, projectId                                     |
| Get sprint/release details        | get_tasks            | taskIds                                                  |
| Create a new sprint               | create_item          | type: "sprint", projectId, name, start?, finish?         |
| Create sprint after an item       | create_item          | type: "sprint", projectId, name, previousItemId          |
| Create a release milestone        | create_item          | type: "release", projectId, name, date?                  |
| Create release after an item      | create_item          | type: "release", projectId, name, previousItemId         |
| Commit item to sprint             | commit_to_sprint     | taskId, sprintId                                         |
| Remove item from sprint           | uncommit_from_sprint | taskId                                                   |
| Update sprint members/dates       | update_item          | itemId, allocations                                      |
| Add all project members to sprint | update_item          | itemId, allocations: { allProjectMembers: true }         |
| Assign work                       | update_item          | itemId, assignedTo: [{ userID }] (must be sprint member) |
| Update estimates                  | update_item          | itemId, points / estimatedDays                           |
| Set sprint priority               | update_item          | itemId, sprintPriority                                   |
| Tag item to release               | update_item          | itemId, releases: [releaseId, ...]                       |
| Get project members               | list_project_users   | projectId                                                |
| Add release notes                 | post_comment         | releaseId, text                                          |

## Committed Items

Items with a `committedToProjectID` are already committed to a sprint. Before modifying, moving, or breaking down committed items, always confirm with the user first. When creating sub-tasks under a committed parent (`parentItemId`), call `get_tasks` on the parent first — if it has `committedToProjectID`, ask the user whether the sub-items should be created in the sprint or in the backlog.

## Related Skills

- [Backlog Grooming](../backlog-refinement/SKILL.md) -- preparing items before sprint planning
- [Task Management](../task-management/SKILL.md) -- daily task work during sprint
- [Bug Tracking](../bug-tracking/SKILL.md) -- committing bugs to sprints