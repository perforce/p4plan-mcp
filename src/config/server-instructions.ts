// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

const INTRO = `You are connected to a P4 Plan project management server.`;

const SEARCH_SKILL_RULE = `IMPORTANT: before calling search_tasks, you MUST call the read_skill tool with skillName="search-queries" to get the correct Find query syntax.`;

// Only applies to tools that write, so it is left out in read-only mode.
const HTML_WRITE_RULE = `IMPORTANT: comment text and multiline field values are sanitized HTML. Plain text (no tags) is accepted as a special case — it is valid HTML and the server stores it as-is. Anything with formatting, lists, links, code blocks, or @mentions must use the allowed HTML subset. Before calling post_comment, update_comment, set_custom_field (for Multiline Text columns), or create_item / update_item with detailedDescription or stepsToReproduce, you MUST call the read_skill tool with skillName="comment-html-format". If the comment includes an @user mention, also call read_skill with skillName="mentions".`;

const SEARCH_QUICK_REFERENCE = `Quick reference for common mistakes (call read_skill for complete syntax):
  WRONG itemType="Bug"                   -> CORRECT Itemtype="Bug"
  WRONG priority="veryHigh"              -> CORRECT Productbacklogpriority="Very high priority"
  WRONG assignedTo:Resource("john")       -> CORRECT Assignedto:Resource("john")
  WRONG itemName:Text("login")           -> CORRECT Itemname:Text("login")
  WRONG status = "notDone"               -> CORRECT Status="Not done" (no spaces around =, human text)
  WRONG Severity="high"                  -> CORRECT Severity="High" (capitalize)

There is NO generic "priority" column. Use Productbacklogpriority, Sprintpriority, or Bugpriority.
Operators: AND (or +), OR, NOT (or !), parentheses for grouping.

RETRY POLICY: if search_tasks returns errors or zero results 3 times consecutively, STOP retrying. Tell the user what you tried (show the exact findQuery values) and ask them to clarify.`;

const SKILLS_LIST = `Additional skills are available via the read_skill tool:
  project-navigation, task-management, planning, backlog-refinement,
  bug-tracking, custom-fields, gantt-scheduling, workflows, pipeline,
  comment-html-format, mentions.`;

// comment-html-format and mentions are only about writing.
const READ_ONLY_SKILLS_LIST = `Additional skills are available via the read_skill tool:
  project-navigation, task-management, planning, backlog-refinement,
  bug-tracking, custom-fields, gantt-scheduling, workflows, pipeline.`;

const READ_ONLY_NOTE = `READ-ONLY MODE: this server only exposes tools that read. Creating, updating, commenting, linking, committing, deleting and other changes are not available, even where a skill describes them. If the user asks for a change, say it cannot be made through this server (it was started with --readonly / P4PLAN_READONLY) instead of trying.`;

/**
 * Server instructions sent to the AI client at connection time.
 *
 * These are surfaced via the MCP `instructions` field in ServerOptions
 * and guide the LLM on how to use tools correctly.
 */
export const SERVER_INSTRUCTIONS = [
  INTRO,
  SEARCH_SKILL_RULE,
  HTML_WRITE_RULE,
  SEARCH_QUICK_REFERENCE,
  SKILLS_LIST,
].join('\n\n');

/**
 * Instructions for read-only mode (--readonly / P4PLAN_READONLY): the same
 * guidance without the rules for tools that write, plus a read-only note.
 */
export const READ_ONLY_SERVER_INSTRUCTIONS = [
  INTRO,
  SEARCH_SKILL_RULE,
  SEARCH_QUICK_REFERENCE,
  READ_ONLY_SKILLS_LIST,
  READ_ONLY_NOTE,
].join('\n\n');
