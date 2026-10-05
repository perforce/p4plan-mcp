---
name: p4-plan-pipeline
description: Guide working with P4 Plan pipelines and pipeline tasks — reading a pipeline's steps, breaking a backlog item down into pipeline sub-tasks, logging defects into a pipeline step, and moving pipeline work forward. Use when the user mentions pipeline, pipeline task, pipeline step, breakdown, auto-spawned tasks, or wants to log a bug against a feature's QA step.
---

# Pipelines in P4 Plan

A **pipeline** (`PipelineWorkflow`) is a template of steps. Unlike a status workflow, which moves
a single item through states, a pipeline **materialises real child items** — one per step — under
the item it is set on. Several steps can be active at once.

Those children are called **pipeline tasks**. They are ordinary items in the item tree, not a
separate item type, which is why most tools work on them normally and why nothing in a tool response
labels them as "pipeline tasks".

## The three item roles

`get_tasks` answers this directly. **`createdFromWorkflow` is the authoritative test for a pipeline
task** — do not infer the role from which fields happen to be null.

| Role                                          | `createdFromWorkflow` | `canHaveWorkflowType`        | `workflow`                            |
|-----------------------------------------------|-----------------------|------------------------------|---------------------------------------|
| **Carrier** — the item the pipeline is set on  | `false`               | `Both`                       | the `PipelineWorkflow` `{id, name}`   |
| **Pipeline task** — an auto-created step       | **`true`**            | `StatusWorkflowOnly` or `None` | `null`, unless a workflow was set on it |
| **Breakdown child** — created under a step     | `false`               | `Both`                       | the step's configured StatusWorkflow  |

`createdFromWorkflow` is the authoritative test: it is true only when the item has a linked
pipeline task *and* the workflow object that created it is still valid.

`canHaveWorkflowType` is a **corroborating** signal, not an equivalent one. It branches on the
creating workflow object alone, without the linked-pipeline-task condition, so the two can
disagree — an item whose linked pipeline task is gone but whose creating workflow object is still
valid reports `createdFromWorkflow: false` and a non-`Both` `canHaveWorkflowType`. When they
disagree, believe `createdFromWorkflow` for the role and `canHaveWorkflowType` for whether a
workflow can be set.

This table is a summary, not the contract. The fields themselves are authoritative — if a
response ever disagrees with the table, trust the field you actually read.

A carrier always shows `workflowStatus: null` — a pipeline has no single active status, so a `null`
workflow status on an item whose `workflow` exists is normal and is **not** an error or missing data.

These four fields are returned on **BacklogTask and ScheduledTask only**. `Bug`, `Sprint` and
`Release` do not have them, because none of them can be created by a pipeline.

Illustrative shape of a carrier and its steps:

```
500100  "Checkout redesign"          carrier         workflow {70, "Feature Delivery"}, createdFromWorkflow false
  500110  "DEV | Implementation"     pipeline task   createdFromWorkflow true
    500111  "Payment adapter"        breakdown child workflow {71, "Implementation Task"}, status {2, "Done"}
  500120  "QA | Defects"             pipeline task   createdFromWorkflow true
```

`linkedToPipelineTask` returns the **carrier** — the task the pipeline is assigned to as its
workflow — as an item with `id` and `name`. Despite the field name it does *not* name a step.
It is non-null whenever `createdFromWorkflow` is true, and also on items that merely sit inside a
carrier's subtree without the pipeline having created them. A top-level carrier reports `null`,
since no pipeline encloses it; fall back to the `subprojectPath` walk below in that case.

## Where pipeline tasks live

**Pipeline tasks are created in the Planning section, and only there.** This drives almost every
mistake agents make with pipelines.

- A Backlog item can carry a pipeline and have **zero** pipeline tasks. The steps do not appear
  until the item exists in Planning — in practice, until it is committed (`committedToProjectID`
  is set).
- An item created directly in Planning gets its steps as soon as the pipeline is set.
- A pipeline task has **no reference in the Backlog or QA section**. Searching the backlog ID for
  one returns nothing, even though the carrier is found there.
- A **committed carrier is listed in both sections**, and the `projectID` you get back depends on
  how you reached it: searching Planning reports the planning ID, while searching the Backlog --
  and `get_tasks`, which always reports the section the item was created in -- reports the backlog
  ID. Same `id` and same `localID` either way, so use `id` for identity and never treat a changed
  `projectID` as a different item.

Consequence: always search the **Planning** section (the bare `projectId`, not `backlogID`/`qaID`)
when looking for pipeline tasks.

## Discovering a pipeline's steps

`get_workflows` returns a pipeline as:

```json
{ "id": "70", "name": "Feature Delivery", "type": "PipelineWorkflow", "canSetWorkflowOnItems": true }
```

**That is everything the API exposes about a pipeline.** There are no step IDs, no step names, no
task types, no field requirements. Distinguish a pipeline from a status workflow by `type`, which
is the GraphQL `__typename` — do not infer it from `statuses` being absent, since a status workflow
can legitimately have an empty status list.

Do not invent step names. To learn what a pipeline actually spawns, read it off an item that
already carries it:

1. Find a carrier — search the **Planning** section:
   `Pipelineorworkflow="Feature Delivery" AND Lastupdatedon>="2026-06-01"`
2. Pick one whose `committedToProjectID` is set (uncommitted carriers have no steps yet).
3. List its steps — search the **Planning** section:
   `Subprojectpath:Text("<carrier name>")`
   The results come back in tree order; `subprojectPath` shows the nesting.
   Carrier names often contain double quotes — say `Checkout redesign ("Buy now" flow)` — so
   escape them as `\"` rather than pasting the name in verbatim, or search a distinctive
   quote-free fragment instead. An unescaped quote fails with `Space is not allowed here`,
   which does not point at the real cause.

`subprojectPath` is the only hierarchy signal in MCP responses — there is no tree-traversal tool.
Items whose `subprojectPath` ends with the carrier's name are its steps; items ending with
`"<carrier>: <step>"` are that step's breakdown children. Confirm a candidate is really a step
with `get_tasks` and `createdFromWorkflow` rather than trusting the name.

Going the other way, `linkedToPipelineTask` on any item in the subtree names the carrier that
the pipeline is assigned to — not the step the item sits under, and not, for nested pipelines,
the nearest carrier. To identify the step itself, walk `subprojectPath`. Treat a `null` as "not
inside a pipeline subtree".

## Step workflows are inherited, not specified

You never need a "pipeline task type ID" to create a correctly-typed sub-task. Each step is
configured with a status workflow for its children, and **the server applies it automatically** to
anything created under that step, along with that workflow's entry status.

For example, children created under a `DEV | Implementation` step come back carrying that
step's implementation workflow, and children under a `QA | Defects` step come back carrying
that step's bug workflow at its entry status. Neither was requested by the caller.

So the sequence for breaking a step down is: create the child under the step, then read it back to
see which workflow it inherited, then use `get_workflows` on the **planning project** to find the
status IDs of that workflow (it is a StatusWorkflow, so `get_workflows` does return its full
`statuses` list) and `update_item` to set the right one.

## Creating items under a pipeline step

This is the sharpest edge in the API. `create_item` picks the target section from `type`, not from
where `parentItemId` lives:

| `create_item` type | Section it creates in                   | Can nest under a pipeline task? |
|--------------------|-----------------------------------------|---------------------------------|
| `backlog_task`     | **Backlog** (resolves `projectId` → backlog ID) | No — the step is not in the Backlog section, so the parent reference cannot resolve  |
| `bug`              | **QA** (resolves `projectId` → QA ID)   | No — same reason, and QA bugs are not part of any pipeline |
| `scheduled_task`   | Planning                                | No — a scheduled task cannot be indented under a pipeline task |
| `sprint_task`      | Planning, inside the given `sprintId`   | Only path that targets Planning with a nestable item type — requires `sprintId`, so it only applies when the step is in a sprint  |

**Check `canBeBrokenDown` on the step first.** `get_tasks` returns it, and `false` means the
pipeline forbids sub-tasks under that step — stop and tell the user rather than creating an item
that does not belong there. (`canBeBrokenDown` is `true` for ordinary items that are not pipeline
tasks at all, so only treat it as meaningful once `createdFromWorkflow` confirms the step.)

Section routing is a separate problem from permission, so **verify placement after creating** even
when the step allows breakdown: call `get_tasks` on the new item and check that `projectID` is the
planning project, or re-run the `Subprojectpath:Text(...)` search and confirm the new item appears
under the step. If it landed at the top of the Backlog instead, the parent did not resolve.

When the breakdown cannot be placed correctly, say so and offer the alternatives rather than
leaving a stray item behind: create the item in the Backlog and commit it, or have the user do the
breakdown in the P4 Plan client.

## Logging a defect into a pipeline step

There are two different things called "bug", and picking the wrong one puts the defect where nobody
will look:

- **A defect against a feature's pipeline step** is an ordinary child item under the step
  (typically named like `QA | Defects`), living in the **Planning** section. It inherits the step's
  bug status workflow. This is what appears in the pipeline view alongside the rest of the feature's
  work. Note that these are typed as `BacklogTask` carrying a bug status workflow — they are not
  `Bug` items.
- **A QA-section bug** (`create_item` with `type: "bug"`) is a `Bug` item in the project's QA
  section. It is a first-class defect record with `severity`, `stepsToReproduce`, and
  `detailedDescription` — but it is **not** attached to any pipeline and will not show in the
  pipeline view.

### Code-review finding → pipeline step

1. Identify the feature the change belongs to (the carrier). If you only have a sprint or a task,
   walk up via `subprojectPath`.
2. List its steps (see "Discovering a pipeline's steps") and pick the QA/bug step.
3. `create_item` with `type: "sprint_task"`, the `sprintId` of the sprint the step sits in,
   `name`, and `parentItemId` set to the step's id — `sprint_task` is the only type that both
   targets Planning and nests, and it rejects the call outright without `sprintId`. Then verify
   placement as described above.
4. Read the created item back with `get_tasks` to see the inherited workflow.
5. `get_workflows(planning projectId)` → find that workflow → `update_item(itemId,
   workflowStatusId: ...)` to set the review-appropriate state (e.g. `New`).
6. Set `priority`; put the review detail in a comment via `post_comment`, or use
   `link_items` to attach the review/changelist URL. `link_items` requires both
   `fromItemId` **and** `relation` — `relation` is one of `relatedTo`, `duplicates`,
   `duplicatedBy`, `blocks`, `blockedBy`, and omitting it is a validation error. Pass `toItemId`
   for an internal link or `url` for an external one.

Note that `severity` and `stepsToReproduce` only exist on QA-section `Bug` items. A step child is a
task, so put reproduction detail in the description or a comment.

If the defect belongs to the project at large rather than to one feature's pipeline, create a
QA-section bug instead and use `link_items` (with `relation: "relatedTo"`) to relate it to the
pipeline work.

## Setting and removing a pipeline

Mind the casing: the parameter is `workflowID` (capital ID) but the related one is
`workflowStatusId` (lowercase d). They are inconsistent with each other and a wrong-case key is
silently ignored rather than rejected, so copy them exactly as written here.

`update_item(itemId, workflowID: "<pipeline id>")` attaches a pipeline. Once the item is in
Planning this **creates items** — one per step — so treat it as a structural change and confirm
with the user first. `workflowID: "-1"` removes the workflow.

Before setting a workflow on a **pipeline task**, read `canHaveWorkflowType` from `get_tasks` — it
tells you the answer in advance rather than making you discover it from an error:

| `canHaveWorkflowType` | Meaning                                                              |
|-----------------------|----------------------------------------------------------------------|
| `Both`                | Not a pipeline task — a status workflow or a pipeline can be set      |
| `StatusWorkflowOnly`  | A pipeline task whose step allows a status workflow (not a pipeline)  |
| `None`                | A pipeline task whose step forbids setting any workflow               |

Setting a workflow where the value is `None` fails with `User not allowed to set value`
(`NOT_ALLOWED`). If you see that error anyway, it is configuration rather than a bad request —
report it instead of retrying.

## Tool mapping

| User intent                                | Tool           | Key parameters                                                    |
|--------------------------------------------|----------------|-------------------------------------------------------------------|
| List pipelines in a project                | `get_workflows`| `projectId` — filter to `type: "PipelineWorkflow"`                |
| Read a pipeline's steps                    | `search_tasks` | Planning `projectId`, `Pipelineorworkflow="<name>"`, then `Subprojectpath:Text("<carrier>")` |
| Find items carrying a pipeline             | `search_tasks` | Planning `projectId`, `Pipelineorworkflow="<name>"`               |
| Find the carrier an item belongs to        | `get_tasks`    | `taskIds` — read `linkedToPipelineTask` (the carrier, not the step)  |
| Check an item's pipeline role              | `get_tasks`    | `taskIds` — read `createdFromWorkflow`, `canHaveWorkflowType`      |
| Attach a pipeline to an item               | `update_item`  | `itemId`, `workflowID` (confirm first — it creates items)         |
| Remove a pipeline                          | `update_item`  | `itemId`, `workflowID: "-1"`                                      |
| Create a sub-task under a step             | `create_item`  | `type: "sprint_task"`, `sprintId` of the step's sprint, `name`, `parentItemId` = step ID — check `canBeBrokenDown` first, verify placement after   |
| Log a defect into a pipeline step          | `create_item`  | `type: "sprint_task"`, `sprintId`, `name`, `parentItemId` = the QA/bug step — **not** `type: "bug"`  |
| Log a project-level defect                 | `create_item`  | `type: "bug"`, `projectId`, `severity`, `stepsToReproduce`        |
| Set a step child's status                  | `update_item`  | `itemId`, `workflowStatusId` from `get_workflows` on the planning project |
| Relate a bug to pipeline work              | `link_items`   | `fromItemId`, `relation` (both required), plus `toItemId` or `url` |
| Trigger the steps for a backlog carrier    | `commit_to_sprint` | `taskId`, `sprintId` — steps appear once the item is in Planning  |

## What the API does not expose

State these plainly if the user asks for them; do not approximate.

| Not available                                                 | Consequence                                                  |
|---------------------------------------------------------------|--------------------------------------------------------------|
| Pipeline step IDs, names, or task types from `get_workflows`   | Steps must be read off an existing carrier                   |
| Per-step field requirements                                    | Cannot pre-validate what a step child needs                  |
| Creating or editing a pipeline definition                      | Pipelines must be authored in the P4 Plan client             |
| Tree traversal (children of an item)                           | Use `subprojectPath` from `search_tasks` instead             |
| Pipeline fields on `Bug` / `Sprint` / `Release`                | Only BacklogTask and ScheduledTask can be pipeline tasks     |

## Related skills

- [Workflows](../workflows/SKILL.md) -- status workflows and status transitions
- [Search Queries](../search-queries/SKILL.md) -- `Pipelineorworkflow` and `Subprojectpath` syntax
- [Planning](../planning/SKILL.md) -- committing items, which is what brings steps into existence
- [Bug Tracking](../bug-tracking/SKILL.md) -- QA-section bugs, severity, triage
