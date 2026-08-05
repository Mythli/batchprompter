---
name: batchprompt-email-generation
description: Generate and quality-check personalized email bodies and subjects with BatchPrompt model steps. Use for generatedEmail/generatedSubject columns, prompt files, initial outreach, follow-ups, deterministic user-supplied templates, small email tests, and approved full generation batches. Do not use to research leads or send messages.
---

# BatchPrompt Email Generation

Apply `$batchprompt-basics`. Read
`apps/batchprompt-cli/examples/02-lead-gen/03-generate-email/` and the simple chain
example before designing a new pipeline.

## Validate the input contract

Inspect the input columns and sample values. Confirm every Handlebars field referenced
by the prompts exists. Treat missing company, person, offer, or address data according
to the caller's rules; never invent it.

If the user supplies finished text with placeholders, preserve it. Use a deterministic
table transform instead of an LLM when no generative decision remains.

## Separate body and subject

Use one model step per output:

```text
body prompt    -> output.mode "column" -> generatedEmail
subject prompt -> output.mode "column" -> generatedSubject
```

A model `prompt` may contain inline text or a prompt-file path. A later subject step
can reference `{{generatedEmail}}` and enriched row fields.

Do not add a subject stage when only a body was requested. Do not send messages from
this pipeline.

## Test before scaling

Run a small fixed test set with `--input-limit`. Read every test email completely.
Check:

- salutation, recipient, and forwarding logic;
- source-grounded personalization;
- exact required links and endings;
- unresolved Handlebars/bracket instructions;
- length, grammar, and forbidden terms;
- output columns and row preservation.

Use deterministic checks for structural rules and manual reading for meaning. Keep
failed outputs. Revise the prompt/config under a new version and rerun the same test
rows until all hard rules pass.

For follow-ups, preserve the original subject when required. If a model step appends
or overwrites it incorrectly, restore it deterministically from the accepted initial
email data.

Show the actual prompt and representative complete results to the caller. Report the
input, config, output, accepted/rejected/skipped rows, and whether a full run still
needs approval.
