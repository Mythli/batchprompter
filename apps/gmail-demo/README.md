# Gmail Puppet Demo

A standalone Commander CLI for listing, reading, creating, replying to,
updating, and deleting Gmail threads with the `gmail-puppet` package.

The app reads `GMAIL_EMAIL` and `GMAIL_PASSWORD` from the process environment.
Inside this workspace it also loads the root `.env` and `.env.tobias` files when
present. Use `--env-file <path>` to select another BatchPrompt environment.

Set `BATCHPROMPT_PUPPETEER_USER_DATA_DIR` to a different relative or absolute
directory for every Gmail account. The demo and BatchPrompt can then share the
same account-specific Chrome session safely when they are run one at a time.

```bash
pnpm --filter gmail-puppet-demo build

pnpm --filter gmail-puppet-demo start list --page 1 --page-size 20
pnpm --filter gmail-puppet-demo start read <thread-id>
pnpm --filter gmail-puppet-demo start create --self --subject "Demo" --body "<p>Hello</p>"
pnpm --filter gmail-puppet-demo start reply <thread-id> --body "<p>Thanks!</p>"
pnpm --filter gmail-puppet-demo start reply <thread-id> --body-file /absolute/path/to/reply.html
pnpm --filter gmail-puppet-demo start update <thread-id> --unread
pnpm --filter gmail-puppet-demo start delete <thread-id> --yes
```

Add `--json` for machine-readable output. Global options may be written before
or after the subcommand. `reply` deliberately does not accept a recipient or
subject: it always replies inside the exact Gmail thread ID supplied by the
caller. Its result includes `verified`, which is true when the configured Gmail
account is the newest sender in that same thread after the send completes.
