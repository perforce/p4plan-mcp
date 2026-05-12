---
name: p4-plan-mentions
description: Format @user mentions inside HTML comments and multiline fields so they render as a proper link in both the Qt desktop client and the React web client. Use when the user wants to ping someone, notify a teammate, address @-name, or reference a user inside a comment / description / steps to reproduce.
---

# @Mentions in P4 Plan Comments

A mention is a regular HTML anchor whose `href` is the user's `userLink` URL. Both clients render it as a styled link; clicking it opens the user.

## Format

```html
<a href="<USER_LINK>">@<DISPLAY_NAME></a>
```

- `<USER_LINK>` — the user's `userLink` field. **Always copy this verbatim** from the GraphQL response — never construct it by hand. It looks like `hansoft://<server>;<database>;<guid>/UserID/<numeric_id>` but the host/database/guid prefix is connection-specific and you don't know it.
- `<DISPLAY_NAME>` — the user's display name. Prepend a literal `@`. The clients show this verbatim — they do **not** auto-resolve names or auto-prepend `@`.

## How to get `userLink`

| Source | Tool | Field |
|---|---|---|
| The current authenticated user | `get_current_user` | `userLink` |
| Members of a project | `list_project_users` | `users[].user.userLink` |

Both tools now return `userLink` as a normal field. Copy it verbatim.

## Examples

### Single mention

```html
<html><body><p>Can you take a look, <a href="hansoft://server;db;guid/UserID/42">@Alice</a>?</p></body></html>
```

### Two mentions in a paragraph

```html
<html><body><p>cc <a href="hansoft://server;db;guid/UserID/42">@Alice</a> and <a href="hansoft://server;db;guid/UserID/77">@Bob</a> — please review.</p></body></html>
```

### Mention inside a list item

```html
<html><body>
<ul style="margin-top:0px;margin-bottom:0px">
  <li>Reviewed by <a href="hansoft://server;db;guid/UserID/42">@Alice</a>.</li>
</ul>
</body></html>
```

## Rules and gotchas

- **`@` is literal.** Both clients display the link text verbatim — they do not auto-prepend `@` or resolve display names. Always include the `@` and the name yourself.
- **Don't put a mention inside `<pre>` or `<code>`.** Code blocks suppress link styling and the chip will render as plain text.
- **Percent-encode special characters in the URL.** Spaces become `%20`, `>` becomes `%3E`. The `userLink` returned by the API is already correctly encoded — copy it verbatim and don't modify.
- **One `<a>` element per mention.** Don't wrap multiple `@names` in a single `<a>`.
- **Mentions live inside the HTML body**, not at the top level — wrap your comment in `<html><body><p>...</p></body></html>` if it contains a mention. See the [comment-html-format](../comment-html-format/SKILL.md) skill for the surrounding format.

## Caveat: server-side notifications

The GraphQL service currently extracts mention IDs only from a legacy `<URL>` tag form (regex match on `<URL...UserID/N>`). The `<a href>` form documented above renders correctly in both clients but **may not trigger user-notification dispatch** on the server. This is a known server-side gap — out of scope for this skill. If a user explicitly asks for "notify so-and-so" and notifications matter, flag it to them as a separate issue rather than working around it.

## Tool Mapping

Mentions are embedded inside the HTML payloads of these tools:

| User Intent | Tool | HTML field |
|---|---|---|
| Mention someone in a new comment | `post_comment` | `text` |
| Mention someone when editing a comment | `update_comment` | `text` |
| Mention someone in a Multiline Text custom field | `set_custom_field` | `value` |
| Mention someone in a Bug's detailed description / steps to reproduce | `create_item` / `update_item` | `detailedDescription`, `stepsToReproduce` |
| Look up a user's `userLink` to use in the `href` | `list_project_users`, `get_current_user` | `userLink` |

## Related Skills

- [comment-html-format](../comment-html-format/SKILL.md) — the HTML format that wraps the mention
- [task-management](../task-management/SKILL.md) — comment workflows
