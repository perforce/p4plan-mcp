// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * Server instructions sent to the AI client at connection time.
 *
 * These are surfaced via the MCP `instructions` field in ServerOptions
 * and guide the LLM on how to use tools correctly.
 */
export const SERVER_INSTRUCTIONS = `You are connected to a P4 Plan project management server.

IMPORTANT: before calling search_tasks, you MUST call the read_skill tool with skillName="search-queries" to get the correct Find query syntax.

Quick reference for common mistakes (call read_skill for complete syntax):
  WRONG itemType="Bug"                   -> CORRECT Itemtype="Bug"
  WRONG priority="veryHigh"              -> CORRECT Productbacklogpriority="Very high priority"
  WRONG assignedTo:Resource("john")       -> CORRECT Assignedto:Resource("john")
  WRONG itemName:Text("login")           -> CORRECT Itemname:Text("login")
  WRONG status = "notDone"               -> CORRECT Status="Not done" (no spaces around =, human text)
  WRONG Severity="high"                  -> CORRECT Severity="High" (capitalize)

There is NO generic "priority" column. Use Productbacklogpriority, Sprintpriority, or Bugpriority.
Operators: AND (or +), OR, NOT (or !), parentheses for grouping.

RETRY POLICY: if search_tasks returns errors or zero results 3 times consecutively, STOP retrying. Tell the user what you tried (show the exact findQuery values) and ask them to clarify.

Additional skills are available via the read_skill tool:
  project-navigation, task-management, planning, backlog-refinement,
  bug-tracking, custom-fields, gantt-scheduling, workflows.`;
