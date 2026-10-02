---
name: p4-plan-custom-fields
description: Guide custom field management, configuration, and usage in P4 Plan. Use when user mentions custom fields, custom columns, creating columns (e.g. Time Spent), metadata, tags, categories, or project-specific data.
---

# Custom Fields in P4 Plan

Custom fields (custom columns) add project-specific data to tasks beyond the built-in fields.

## Key Concepts

- Each project defines its own set of custom columns.
- Columns have types: Text, Multiline Text, Number, Decimal Number, Date, DateTime, Time Spent, Drop List, Multi-select Drop List, User, Hyperlink, and Function (computed).
- To set a drop-list or multi-select value, pass option IDs (from get_custom_columns or the create_custom_column response `items`), not display labels, to set_custom_field.
- **Function** fields are read-only — they appear in get_custom_fields output but cannot be set via set_custom_field.
- Use onlySet parameter on get_custom_fields to skip empty fields.

## Creating Columns

The create_custom_column description covers sections and types. Extra rules:
- One section per call (list_projects IDs, never a name). "Everywhere" = 3 calls with identical name/type/unit/options so it stays one column.
- Drop-list items: labels `["Low","High"]`, or `{name, icon}` objects (not label/color). Colours: `greenCircle`, `yellowCircle`, `redCircle`, `blueCircle`, `orangeCircle`, `magentaCircle`.
- Auto-assign (`autoAssignToUsers`/`autoAssignToUserGroups`) only works on singleSelectionDropList; tell the user multi-select can't.
- `updateOn*` date flags need `updateOnlyFirstTime` (true = first time, false = every time).
- `useForTimeReporting` replaces the project's time-reporting column (one for planning+backlog, one for QA): only set it when asked, and tell the user.
- "Already exists" = name taken in that section (case-insensitive): tell the user. No formula columns, renames or deletes.

## Tool Mapping

| User Intent | Tool | Key Parameters |
| --- | --- | --- |
| List available custom columns | get_custom_columns | projectId, activeOnly |
| Read task's custom field values | get_custom_fields | taskId, onlySet |
| Set a custom field value | set_custom_field | taskId, customFieldId, value |
| Add a column to a project | create_custom_column | projectId, name, columnType |

## Value Formats by Type

| Column Type | Value Format |
| --- | --- |
| Text | Any string |
| Multiline Text | Sanitized HTML; plain text accepted (no tags = valid HTML). Use HTML for formatting or @mentions — see comment-html-format skill |
| Number | Integer string, e.g. "5" |
| Decimal Number | Numeric string, e.g. "5.5" |
| Date | ISO date "YYYY-MM-DD" |
| DateTime | ISO datetime "YYYY-MM-DDTHH:MM:SS" |
| Time Spent | Hours as numeric string, e.g. "2.5" |
| Drop List | Option ID from get_custom_columns |
| Multi-select Drop List | Comma-separated option IDs, e.g. "id1, id2, id3" |
| Hyperlink | URL string |
| User | Comma-separated user IDs from list_project_users |
| Function | Read-only — computed value |

To clear a field, pass an empty string as the value.

## Related Skills

- [Task Management](../task-management/SKILL.md) -- built-in task fields
- [Backlog Grooming](../backlog-refinement/SKILL.md) -- backlog item fields
- [Workflows](../workflows/SKILL.md) -- workflow status fields (same tool module)
- [Comment HTML Format](../comment-html-format/SKILL.md) -- HTML format for Multiline Text values
- [Mentions](../mentions/SKILL.md) -- @user references inside Multiline Text values
