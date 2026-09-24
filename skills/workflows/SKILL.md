---
name: p4-plan-workflows
description: Guide using status workflows in P4 Plan for task sign-off, testing, and status progression. Use when user mentions workflows, sign-off, approval, status workflow, or task sequences. For pipelines and pipeline tasks, read the pipeline skill instead.
---

# Status Workflows in P4 Plan

## Key Concepts

- **Workflow** (StatusWorkflow): Defines a state machine for task status progression (e.g., Draft -> Review -> Approved). Does not create new tasks.
- **Pipeline** (PipelineWorkflow): A template of stages that materialises real child items under the item it is set on, once that item is in the Planning section. `get_workflows` returns a pipeline's name only -- no stages, no task types. Read the [pipeline](../pipeline/SKILL.md) skill before doing anything with pipelines.
- **Workflow status** vs **item status**: Item status is the basic four (notDone, inProgress, completed, blocked). Workflow status is a custom set of states defined by the workflow. Some workflows hide item status.
- To change workflow status, get the target status ID from get_workflows, then pass it as workflowStatusId to update_item.

## Tool Mapping

| User Intent | Tool | Key Parameters |
|-------------|------|----------------|
| List workflows and pipelines | get_workflows | projectId (`type` distinguishes StatusWorkflow from PipelineWorkflow) |
| Check task's current workflow status | get_tasks | taskIds (check workflow, workflowStatus) |
| Change workflow status | update_item | itemId, workflowStatusId (ID from get_workflows) |

## Workflow Status Change Sequence

1. get_workflows(projectId) -- find available statuses and their IDs
2. Identify the target status ID from the workflow's statuses array
3. update_item(itemId, { workflowStatusId: targetStatusId })

## Related Skills

- [Pipeline](../pipeline/SKILL.md) -- pipelines, pipeline tasks, breakdown, defects in a stage
- [Task Management](../task-management/SKILL.md) -- basic task status updates
- [Planning](../planning/SKILL.md) -- committing items, which is what brings pipeline stages into existence
