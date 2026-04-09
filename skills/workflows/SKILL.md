---
name: p4-plan-workflows
description: Guide using workflows and pipelines in P4 Plan for task sign-off, testing, and automated task creation. Use when user mentions workflows, pipelines, sign-off, approval, status workflow, or task sequences.
---

# Workflows and Pipelines in P4 Plan

## Key Concepts

- **Workflow** (StatusWorkflow): Defines a state machine for task status progression (e.g., Draft -> Review -> Approved). Does not create new tasks.
- **Pipeline** (PipelineWorkflow): A task template that spawns sub-tasks when an item is committed to Planning. Creates new tasks automatically.
- **Workflow status** vs **item status**: Item status is the basic four (notDone, inProgress, completed, blocked). Workflow status is a custom set of states defined by the workflow. Some workflows hide item status.
- To change workflow status, get the target status ID from get_workflows, then pass it as workflowStatusId to update_item.

## Tool Mapping

| User Intent | Tool | Key Parameters |
|-------------|------|----------------|
| List workflows and pipelines | get_workflows | projectId |
| Check task's current workflow status | get_tasks | taskIds (check workflow, workflowStatus) |
| Change workflow status | update_item | itemId, workflowStatusId (ID from get_workflows) |

## Workflow Status Change Sequence

1. get_workflows(projectId) -- find available statuses and their IDs
2. Identify the target status ID from the workflow's statuses array
3. update_item(itemId, { workflowStatusId: targetStatusId })

## Related Skills

- [Task Management](../task-management/SKILL.md) -- basic task status updates
- [Planning](../planning/SKILL.md) -- pipelines activate on sprint commit
