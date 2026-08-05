---
name: gmail-demo
description: Inspect and manage Gmail threads through the gmail-demo CLI. Use for Gmail searches, paginated email listings, reading threads, sending a new email, changing read status, moving a thread to trash, selecting a Gmail .env profile, or producing machine-readable Gmail results. Do not use for BatchPrompt campaign generation or bulk campaign sends.
---

# Gmail Demo

Use the installed `gmail-demo` command for Gmail CRUD-style operations. Assume
the command is already built and available in `PATH`. Do not run builds, pnpm
workspace commands, or repository-local JavaScript entry points.

## Execution contract

1. Run `command -v gmail-demo` when command availability is uncertain.
2. Stop and report a missing PATH installation when it is unavailable. Do not
   search for source code or build the app.
3. Put global options before the subcommand.
4. Prefer `--json` and parse the JSON result instead of scraping human output.
5. Never print, echo, log, or return Gmail passwords.
6. Treat `create`, `update`, and `delete` as live Gmail mutations.

## Select credentials

Use credentials already inherited by the process when available:

```bash
gmail-demo --json list --page 1 --page-size 20
```

Select a profile with an absolute path when credentials are stored in a file:

```bash
gmail-demo --env-file /absolute/path/to/.env --json list --page 1
```

The file must provide:

```dotenv
GMAIL_EMAIL=account@example.com
GMAIL_PASSWORD=secret
```

Existing process variables take precedence over values loaded from the file.
A user can override a profile for one local invocation:

```bash
GMAIL_EMAIL="account@example.com" \
GMAIL_PASSWORD="secret" \
gmail-demo --json list --page 1
```

Show only placeholders in instructions or chat. Do not place real credentials
in tool-call command text. Do not ask the user to paste passwords into chat.

## List and paginate

List the inbox:

```bash
gmail-demo --json list --page 1 --page-size 20
```

Use Gmail search syntax:

```bash
gmail-demo --json list \
  --query 'from:customer@example.com is:unread' \
  --page 1 --page-size 20
```

Use `items`, `hasNextPage`, and `hasPreviousPage` from the response. Increment
`--page` only while `hasNextPage` is true. Keep `--page-size` between 1 and 50.
Do not fetch every page unless the user requests a complete result set.

Useful scopes include `in:inbox`, `in:sent`, `in:trash`, and `in:anywhere`.

## Read a thread

First obtain the exact thread ID and its `isUnread` state with `list`. Then read:

```bash
gmail-demo --json read THREAD_ID
```

Reading normally leaves the thread read. To preserve an initially unread
thread, use:

```bash
gmail-demo --json read THREAD_ID --preserve-unread
```

Use `--preserve-unread` only when the preceding list result reported
`isUnread: true`. This preserves the original read state without guessing.

## Create an email

Sending is an external side effect. Require an explicit user request containing
or clearly identifying the recipient, subject, and body. Send HTML directly:

```bash
gmail-demo --json create \
  --to recipient@example.com \
  --subject 'Subject' \
  --body '<p>Email body</p>'
```

Read a longer body from a file:

```bash
gmail-demo --json create \
  --to recipient@example.com \
  --subject 'Subject' \
  --body-file /absolute/path/to/body.html
```

For an explicitly requested internal smoke test, prefer `--self`:

```bash
gmail-demo --json create \
  --self \
  --subject 'Gmail demo smoke test' \
  --body '<p>Test</p>'
```

Capture `threadId` from the result. If it is `null` because Gmail indexing is
delayed, search `in:sent` using the exact subject before continuing.

## Update read state

Require the exact thread ID. Mark it read or unread:

```bash
gmail-demo --json update THREAD_ID --read
gmail-demo --json update THREAD_ID --unread
```

When verification matters, run a narrow follow-up list query for the same
thread context with `is:read` or `is:unread`.

## Delete a thread

Delete means moving a thread to Gmail trash and is recoverable until Gmail
permanently removes it. Require explicit authorization for the exact thread.
Use `--yes` only after that authorization:

```bash
gmail-demo --json delete THREAD_ID --yes
```

Verify material deletes with a narrow `in:trash` search and, when relevant,
confirm the thread is absent from `in:inbox`. Report that the thread remains
recoverable from trash.

## Report results

Report the command outcome, affected thread IDs, pagination state, and any
verification performed. Never include credentials or complete unrelated email
contents. If Gmail authentication, indexing, or DOM automation retries fail,
report the final error and leave the requested mutation unconfirmed.
