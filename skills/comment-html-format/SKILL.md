---
name: p4-plan-comment-html-format
description: Author HTML-formatted comments and multiline field values that render correctly in both the Qt desktop client and the React web client. Use when posting/editing comments, setting Multiline Text custom fields, or writing detailedDescription/stepsToReproduce on a Bug.
---

# Comment & Multiline HTML Format

P4 Plan stores comments and multiline field values as **sanitized HTML**. Both the Qt desktop client and the React web client render this HTML — anything outside the allow-list below is silently stripped server-side.

This skill covers the format. For @user references inside this HTML, see the [mentions skill](../mentions/SKILL.md).

## When to use

Read this skill before calling any of:

- `post_comment` — `text` is HTML
- `update_comment` — `text` is HTML
- `set_custom_field` — `value` is HTML when the column type is **Multiline Text**
- `create_item` / `update_item` — `detailedDescription` and `stepsToReproduce` are HTML (Bug only)

## Wire format

- **Plain prose with line breaks**: send the raw text. Newlines (`\n`) are preserved. The server stores it as plain text. No envelope needed.
- **Anything formatted** (bold, lists, links, mentions, code, tables): wrap in `<html><body>...</body></html>`. The server sanitizes and may strip the envelope on storage if no formatting survives.

## Allowed tags

| Tag | Use for | Notes |
|---|---|---|
| `<p>` | Paragraph | Default block. Don't put CSS on it (margin/color all stripped). |
| `<br>` | Line break inside a paragraph | |
| `<strong>`, `<b>` | Bold | Use semantic `<strong>`. |
| `<em>`, `<i>` | Italic | Use semantic `<em>`. |
| `<u>` | Underline | |
| `<s>`, `<del>` | Strikethrough | |
| `<span>` | Inline color/highlight only | Only place where inline `color` / `background-color` survive. |
| `<a href="...">` | Hyperlink | Use for @mentions (see mentions skill). External links allowed. |
| `<blockquote>` | Quoted text | Browser-default styling on web; indented in Qt. |
| `<pre>`, `<code>` | Code block / inline code | `<pre><code>...</code></pre>` for multi-line. Qt converts to its configured code font. |
| `<ul>`, `<ol>`, `<li>` | Lists | Add inline `style="margin-top:0px;margin-bottom:0px"` on `<ul>`/`<ol>` for clean Qt rendering. `<ol type="...">`/`start` honored. |
| `<table>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<td>`, `<th>`, `<caption>`, `<colgroup>`, `<col>` | Tables | Use `border` attribute on `<table>` and `style="border-collapse:collapse"` for cross-client borders. |
| `<img src="hansoft://...">` | Embedded image | **Only** `hansoft://` URLs render in Qt. External URLs render in the web client only. Avoid for cross-client comments. |

## Allowed inline CSS

Everything else is stripped. Don't try to be creative — `font-size`, `font-family`, `text-decoration`, `text-align`, etc. are all stripped.

| Property | Where | Example |
|---|---|---|
| `color` | `<span>` only | `<span style="color:rgb(76,175,80);">done</span>` |
| `background-color` | `<span>` only | `<span style="background-color:#fff59d;">attention</span>` |
| `margin-top`, `margin-bottom`, `margin-left`, `margin-right` | `<ul>`, `<ol>` (any value); `<p>` (must be `0px`) | `<ul style="margin-top:0px;margin-bottom:0px">` |
| `-qt-list-indent` | `<ul>`, `<ol>` | Controls list nesting depth in Qt. |
| `border`, `border-width`, `border-style`, `border-color`, `border-collapse` | `<table>`, `<td>`, `<th>` | |

## Don't use

- **Headings (`<h1>`–`<h6>`)** — sanitizer strips. Use `<p><strong>...</strong></p>` instead.
- **`<div>`** — strip-list; content is preserved but the tag is removed.
- **Markdown** (`**bold**`, `# heading`, ` ```code``` `) — stored verbatim, never converted.
- **Inline `style` on `<p>`, `<a>`, `<li>`, `<td>`, `<tr>`** beyond the table above — colors/fonts/sizes are stripped.
- **External `<img>` URLs** — Qt only renders `hansoft://` images.
- **`<script>`, `<iframe>`, `<style>`, `<form>`, `<button>`, `<input>`, event handlers (`onclick=...`)** — stripped with content removed.

## Examples

### 1. Short formatted comment

```html
<html><body><p>Looks good — <strong>shipping today</strong>.</p></body></html>
```

### 2. Status update with bullets and a mention

```html
<html><body>
<p>Daily update:</p>
<ul style="margin-top:0px;margin-bottom:0px">
  <li>Fixed login redirect bug.</li>
  <li>Reviewed by <a href="hansoft://server;db;guid/UserID/42">@Alice</a>.</li>
  <li>Performance regression <span style="color:rgb(76,175,80);">resolved</span>.</li>
</ul>
</body></html>
```

(For mention construction, see the [mentions skill](../mentions/SKILL.md) — copy `userLink` from `list_project_users`/`get_current_user` directly into the `href`.)

### 3. Multiline custom field with code block

```html
<html><body>
<p>Repro:</p>
<pre><code>curl -X POST /api/login \
  -H "Content-Type: application/json" \
  -d '{"user":"x","pass":"y"}'</code></pre>
<p>Server returns <code>500</code> instead of <code>401</code>.</p>
</body></html>
```

### 4. Bug stepsToReproduce with a numbered list

```html
<html><body>
<ol style="margin-top:0px;margin-bottom:0px">
  <li>Open the Boards view.</li>
  <li>Drag a card across columns.</li>
  <li>Refresh the page — <strong>card returns to original column</strong>.</li>
</ol>
</body></html>
```

## Common mistakes

- **Forgetting the envelope on formatted content.** Server is forgiving but the Qt client is happier with `<html><body>...</body></html>` around anything beyond plain text.
- **Coloring with `<font color>` or `style="color"` on `<p>`/`<a>`/`<li>`.** Wrap the colored span explicitly: `<span style="color:...">text</span>`.
- **Sending markdown.** It will be displayed as literal `**bold**` to users.
- **Authoring tables with `<tr>` only (no `<thead>`/`<tbody>`).** Both clients tolerate it but Qt renders header cells (`<th>`) more cleanly when wrapped in `<thead>`.
- **Putting a mention chip inside a `<pre>` or `<code>` block.** It will render as plain text — code blocks suppress link styling.

## Tool Mapping

| User Intent | Tool | HTML field |
|---|---|---|
| Post a comment | `post_comment` | `text` |
| Edit a comment | `update_comment` | `text` |
| Set a Multiline Text custom column value | `set_custom_field` | `value` (when column type is `MultilineText`) |
| Set Bug detailed description | `create_item` / `update_item` | `detailedDescription` |
| Set Bug steps to reproduce | `create_item` / `update_item` | `stepsToReproduce` |

## Related Skills

- [mentions](../mentions/SKILL.md) — @user references inside this HTML
- [task-management](../task-management/SKILL.md) — comment / assignment workflows
- [custom-fields](../custom-fields/SKILL.md) — when to use `set_custom_field`
- [bug-tracking](../bug-tracking/SKILL.md) — Bug-specific fields including `detailedDescription` and `stepsToReproduce`
