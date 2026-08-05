---
name: batchprompt-email-sending
description: Test and execute authorized email sends with BatchPrompt gmailSender, and inspect gmailReplier workflows when requested. Use for Gmail environment profiles, recipient safety tests, generated subject/body dispatch, duplicate and received-email checks, thread replies, variants, result-status verification, and controlled bulk sends.
---

# BatchPrompt Email Sending

Apply `$batchprompt-basics`. Read the canonical configs at:

- `apps/batchprompt-cli/examples/02-lead-gen/05-send/`
- `apps/batchprompt-cli/examples/03-email-reply/`

Sending changes external state. Require explicit authorization for the sender,
recipients/input file, campaign/purpose, and email stage. Do not rewrite content or
research recipients during a send-only task.

## Configure `gmailSender`

The plugin accepts:

- `to`, `subject`, and required `body`;
- subject/body variant arrays with keys;
- optional `variant` and `replyToId`;
- `delayMin` and `delayMax`;
- `sendIfReceived`, `skipIfSubjectMatch`;
- `replyToLastThread`, `requireExistingThread`;
- `evaluateReplies` and `evaluationModel`;
- plugin `output`.

Use `taskConcurrency: 1` for cautious sequential outreach unless the caller explicitly
approves a different policy.

Semantics:

- `sendIfReceived: false` skips a recipient when Gmail has received mail from them.
- `skipIfSubjectMatch: true` skips an already-sent exact subject.
- `replyToLastThread: true` replies to the latest sent thread when found.
- `requireExistingThread: true` skips when no sent thread exists.
- variant arrays cycle by original row index unless `variant` selects a key/index.

## Load credentials safely

Provide `GMAIL_EMAIL` and `GMAIL_PASSWORD` through the intended environment file. Do
not print or source the file. A profile-specific CLI invocation can use:

```bash
DOTENV_CONFIG_PATH="$ENV_FILE" \
  node "$BATCHPROMPT_CLI" generate --config "$CONFIG" < "$INPUT"
```

## Test and verify

Before a bulk send, create a small internal-recipient batch containing the exact
subject/body version and run the real `gmailSender` configuration with the selected
sender. Show the complete test message and recorded status. Proceed only when every
required test row reports `gmailSender.status = success`.

Write every result to a dedicated output file. Count `success`, `skipped`, and
failures and report skip reasons such as `received_email`, `subject_match`, or
`no_existing_thread`. Process startup is not evidence of delivery.

Use `gmailReplier` only when the user asks to inspect or draft replies. Respect
`targetQuery`, limits, evaluation, and interactive review settings from the reply
example.
