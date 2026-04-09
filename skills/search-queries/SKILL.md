---
name: p4-plan-search-queries
description: P4 Plan Find query syntax for advanced searching. Use when user needs to search, filter, or find items by status, assignee, priority, severity, dates, custom fields, or any combination.
---

# P4 Plan Find Query Syntax

The `search_tasks` tool accepts a `findQuery` parameter for searching using P4 Plan's query language. Use it to filter by status, assignee, priority, dates, or any combination. For simple name search use `Itemname:Text("text")`.

**⚠️ Column names must be spelled exactly as shown below. There is no `priority` column — use `Productbacklogpriority`, `Sprintpriority`, or `Bugpriority`. There is no `itemType` — use `Itemtype`. No spaces in column names, exact casing. Values use human-readable strings like "Very high priority", NOT enum values like "veryHigh".**

## Common Mistakes

| ❌ Wrong                                  | ✅ Correct                                          |
|------------------------------------------|----------------------------------------------------|
| `itemType="Bug"`                         | `Itemtype="Bug"`                                   |
| `priority="veryHigh"`                    | `Productbacklogpriority="Very high priority"`      |
| `Bugpriority="veryHigh"`                 | `Bugpriority="Very high priority"`                 |
| `type="Bug"`                             | `Itemtype="Bug"`                                   |
| `assignedTo:Resource("john")`            | `Assignedto:Resource("john")`                      |
| `itemName:Text("login")`                 | `Itemname:Text("login")`                           |
| `status = "notDone"` (spaces around `=`) | `Status="Not done"` (no spaces around `=`)         |
| `Status="notDone"`                       | `Status="Not done"` (use human-readable text)      |
| `Severity="high"`                        | `Severity="A"` (A/B/C/D letter codes)              |
| `Severity="Critical"`                    | `Severity="A"` (use letter codes, not text names)  |

## Operators

| Operator     | Meaning                | Example                                                          |
|--------------|------------------------|------------------------------------------------------------------|
| `AND` or `+` | Both conditions true   | `Status="Not done" AND Severity="A"`                             |
| `OR`         | Either condition true  | `Status="Not done" OR Status="In progress"`                      |
| `NOT` or `!` | Negate condition       | `NOT Status="Completed"`                                         |
| `-`          | First true, second not | `Status="Not done" - Workremaining>5`                            |
| `()`         | Group conditions       | `(Severity="A" OR Severity="B") AND Status="Not done"` |

## Status Values

| Value           | Meaning          |
|-----------------|------------------|
| `Not done`      | Not started      |
| `In progress`   | Currently active |
| `Completed`     | Done             |
| `Blocked`       | Blocked          |

Example: `Status="Not done" OR Status="In progress"`

## Priority Columns (there is NO generic "priority")

There are **three separate priority columns** — each applies to a different item type. All use the same values:

| Column name              | Applies to    | Example syntax                                      |
|--------------------------|---------------|-----------------------------------------------------|
| `Productbacklogpriority` | Backlog items | `Productbacklogpriority="Very high priority"`       |
| `Sprintpriority`         | Sprint items  | `Sprintpriority="High priority"`                    |
| `Bugpriority`            | Bugs only     | `Bugpriority="Very high priority"`                  |

**Priority values** (same for all three columns):

| Value                  |
|------------------------|
| `Very high priority`   |
| `High priority`        |
| `Medium priority`      |
| `Low priority`         |
| `Very low priority`    |

## Item Types

Use `Itemtype` to filter by type. Exact values:

| Value            | Description            |
|------------------|------------------------|
| `Bug`            | Bug in QA section      |
| `BacklogTask`    | Task in backlog        |
| `ScheduledTask`  | Task in planning/Gantt |
| `Sprint`         | Sprint                 |
| `Release`        | Release milestone      |

Example: `Itemtype="Bug" AND Status="Not done"`

## Severity (Bugs only — use letter codes)

| Value | Meaning                           |
|-------|-----------------------------------|
| `A`   | Critical — system unusable        |
| `B`   | High — major functionality broken |
| `C`   | Medium — partially working        |
| `D`   | Low — minor / cosmetic            |

Example: `Severity="A" OR Severity="B"`

## Confidence and Risk

| Value    |
|----------|
| `None`   |
| `Low`    |
| `Medium` |
| `High`   |

Example: `Confidence="High"`, `Risk="Low"`

## Other Columns

| Column          | Syntax                            | Notes                 |
|-----------------|-----------------------------------|-----------------------|
| `Itemname`      | `Itemname:Text("search text")`    | Item name/description |
| `Assignedto`    | `Assignedto:Resource("username")` | Assigned user         |
| `Points`        | `Points=5`                        | Story points          |
| `Estimateddays` | `Estimateddays=3`                 | Estimated days        |
| `Workremaining` | `Workremaining>0`                 | Hours remaining       |
| `Duration`      | `Duration=5`                      | Duration in days      |
| `Color`         | `Color="red"`                     | Item color            |
| `Committedto`   | `Committedto:Item("Sprint 1")`    | Committed to sprint   |
| `ID`            | `ID=42`                           | Item ID number        |
| `Level`         | `Level<3`                         | Hierarchy depth       |

## Text Search Columns

| Column                | Syntax                             |
|-----------------------|------------------------------------|
| `Itemname`            | `Itemname:Text("text")`            |
| `Comments`            | `Comments:Text("text")`            |
| `Detaileddescription` | `Detaileddescription:Text("text")` |
| `Stepstoreproduce`    | `Stepstoreproduce:Text("text")`    |
| `Userstory`           | `Userstory:Text("text")`           |
| `Hyperlink`           | `Hyperlink:Text("text")`           |
| `Subprojectpath`      | `Subprojectpath:Text("text")`      |
| `Releasetag`          | `Releasetag:Text("text")`          |

## Date/Time Columns

| Column                | Syntax                              |
|-----------------------|-------------------------------------|
| `Start`               | `Start="2026-03-01"`                |
| `Finish`              | `Finish<="2026-03-31"`              |
| `Lastupdatedon`       | `Lastupdatedon>="2026-03-01"`       |
| `Lastcommentedon`     | `Lastcommentedon>="2026-03-01"`     |
| `Originallycreatedon` | `Originallycreatedon>="2026-01-01"` |

Comparison operators: `=`, `<`, `>`, `<=`, `>=`

Date range: `fromdatetodate(2026-01-01, 2026-03-31)` or `fromdatetodate(now-7d, now)`

## Resource Columns

| Column                | Syntax                                     |
|-----------------------|--------------------------------------------|
| `Assignedto`          | `Assignedto:Resource("username")`          |
| `Originallycreatedby` | `Originallycreatedby:Resource("username")` |
| `LastUpdatedBy`       | `LastUpdatedBy:Resource("username")`       |
| `Editableby`          | `Editableby:Resource("username")`          |
| `Watch`               | `Watch:Resource("username")`               |
x
## Boolean Conditions

| Condition                   | Syntax                                 |
|-----------------------------|----------------------------------------|
| Hidden items                | `GeneralconditionHidden=true`          |
| Assigned to me              | `GeneralconditionAssignedtome=true`    |
| Has sub items               | `GeneralconditionHassubitems=true`     |
| In current sprint           | `GeneralconditionIncurrentsprint=true` |
| Not assigned                | `GeneralconditionNotassigned=true`     |
| User story                  | `GeneralconditionUserstory=true`       |
| Epic                        | `GeneralconditionEpic=true`            |
| Ongoing work                | `GeneralconditionOngoingwork=true`     |
| Completed (scheduled)       | `ScheduledconditionCompleted=true`     |
| In progress (scheduled)     | `ScheduledconditionInprogress=true`    |
| Not started yet (scheduled) | `ScheduledconditionNotstartedyet=true` |
| Overdue (scheduled)         | `ScheduledconditionOverdue=true`       |
| Critical path (scheduled)   | `ScheduledconditionCriticalpath=true`  |
| Release overdue             | `GeneralconditionReleaseoverdue=true`  |

## Special Keywords

| Keyword                | Meaning                                          |
|------------------------|--------------------------------------------------|
| `mywork`               | Items assigned to current user                   |
| `assignedtome`         | Same as mywork                                   |
| `week15`               | Items scheduled during week 15                   |
| `fromdatetodate(a,b)`  | Date range (supports `now-Nd`, `now+Nd`)         |

## Custom Columns

Custom columns use their name directly: `MyColumnName:Text("value")`, `MyColumnName=<number>`, etc. The operator depends on the custom column type.

## Example Queries

```
# All open bugs with critical severity
Itemtype="Bug" AND Status="Not done" AND Severity="A"

# High-priority bugs
Itemtype="Bug" AND Bugpriority="Very high priority"

# High-priority backlog items (NOT Bugpriority, NOT priority)
Productbacklogpriority="Very high priority" AND Status="Not done"

# Open bugs with high or critical severity
Itemtype="Bug" AND (Severity="A" OR Severity="B") AND NOT Status="Completed"

# Items assigned to a specific user
Assignedto:Resource("john.doe")

# Unassigned items in current sprint
GeneralconditionIncurrentsprint=true AND GeneralconditionNotassigned=true

# Items updated in the last 7 days
Lastupdatedon>=fromdatetodate(now-7d, now)

# All user stories with points
GeneralconditionUserstory=true AND Points>0

# Overdue scheduled tasks
ScheduledconditionOverdue=true

# Items with specific text in comments
Comments:Text("blocker")

# Blocked items
Status="Blocked"

# In-progress items with high sprint priority
Status="In progress" AND Sprintpriority="High priority"

# Bugs by severity
Itemtype="Bug" AND Severity="A"
```

## Handling "Limit Exceeded" Errors

When `search_tasks` returns **"limit exceeded"**, the result set is too large for one query. **Do NOT retry the same query or ask the user.** Instead, decompose the query by splitting it into multiple narrower sub-queries along a known dimension, run them one at a time, and aggregate the results.

### Decomposition Dimensions (pick the one that fits the user's intent)

| Dimension   | Values to iterate                                                                            | Best when…                           |
|-------------|----------------------------------------------------------------------------------------------|--------------------------------------|
| Severity    | `Severity="A"`, `Severity="B"`, `Severity="C"`, `Severity="D"`                               | User wants bug breakdown by severity |
| Status      | `Status="Not done"`, `Status="In progress"`, `Status="Completed"`, `Status="Blocked"`        | User wants status distribution       |
| Bugpriority | `Bugpriority="Very high priority"` … `Bugpriority="Very low priority"`, `Bugpriority="None"` | User wants priority breakdown        |
| Date range  | Split into monthly/weekly ranges with `fromdatetodate()`                                     | User wants trends over time          |

### Strategy

1. **Choose the dimension** that best matches what the user is asking about. If the user asks "show me bugs by severity", split on Severity. If they ask "how many bugs are open", split on Status.
2. **Construct sub-queries** by adding `AND <dimension>=<value>` to the original query for each possible value.
3. **Run sub-queries one at a time** and collect the `count` from each result.
4. **Aggregate** — sum counts for totals, or present per-value counts for charts/breakdowns.
5. **If a sub-query still exceeds the limit**, decompose it further by adding a second dimension (e.g., Severity AND Status).

### Examples

```
# User asks: "Show me a pie chart of all bugs by severity"
# Original query that would fail: Itemtype="Bug"
# Decompose by Severity:

Severity="A"  → count: 781
Severity="B"  → count: 2030
Severity="C"  → count: 3069
Severity="D"  → count: 1517
# Total: 7397. Render pie chart from these 4 counts.

# User asks: "How many open bugs per priority?"
# Decompose by Bugpriority, all with AND Status="Not done":

Status="Not done" AND Bugpriority="Very high priority"  → count: ...
Status="Not done" AND Bugpriority="High priority"       → count: ...
Status="Not done" AND Bugpriority="Medium priority"     → count: ...
Status="Not done" AND Bugpriority="Low priority"        → count: ...
Status="Not done" AND Bugpriority="Very low priority"   → count: ...
```

### Key Rules

- **Never ask the user what to do** when you get "limit exceeded" — decompose automatically.
- **Only use the `count`** from each sub-query when building summaries/charts — you don't need the individual items.
- If you only need counts (for charts, summaries), this is very efficient: 4-6 lightweight queries instead of one huge one.

## Related Skills

- [Project Navigation](../project-navigation/SKILL.md) -- finding projects and items
- [Task Management](../task-management/SKILL.md) -- working with tasks
