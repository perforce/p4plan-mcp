---
name: p4-plan-bug-tracking
description: Guide bug tracking workflows including creation, triage, severity classification, and resolution in P4 Plan QA. Use when user mentions bugs, defects, QA, triage, severity, quality assurance, create bug, or fixing issues.
---

# Bug Tracking in P4 Plan

Bugs are tracked in the **Quality Assurance** section. Use the project's qaID (from get_project) when creating bugs.

## Key Concepts

- **Severity**: A (critical/system unusable), B (major functionality broken), C (partially working), D (minor/cosmetic)
- **Bug fields**: name, severity, detailedDescription, stepsToReproduce, priority
- **Bug priority** values: veryHigh, high, medium, low, veryLow, none (separate from severity)
- Bugs can be committed to sprints and tagged to releases just like backlog items.

## Tool Mapping

| User Intent             | Tool                | Key Parameters                                                                |
|-------------------------|---------------------|-------------------------------------------------------------------------------|
| Create a bug            | create_item         | type: "bug", projectId, name, severity, detailedDescription, stepsToReproduce |
| Find bugs               | search_tasks        | findQuery, projectId (use QA section ID)                                      |
| Get bug details         | get_tasks           | taskIds                                                                       |
| Set severity            | update_item         | itemId, severity (A/B/C/D)                                                    |
| Set priority            | update_item         | itemId, priority                                                              |
| Assign bug              | update_item         | itemId, assignedTo: [{ userID }]                                              |
| Start work on bug       | start_task          | taskId                                                                        |
| Resolve bug             | complete_task       | taskId                                                                        |
| Add discussion          | post_comment        | taskId, text                                                                  |
| List attached files     | get_attachments     | taskId                                                                        |
| View screenshot/file    | download_attachment | taskId, path (from get_attachments)                                           |
| Commit bug to sprint    | commit_to_sprint    | taskId, sprintId                                                              |
| Get team for assignment | list_project_users  | projectId                                                                     |

## Committed Items

Bugs with a `committedToProjectID` are already committed to a sprint. Before modifying, moving, or breaking down committed bugs, always confirm with the user first.