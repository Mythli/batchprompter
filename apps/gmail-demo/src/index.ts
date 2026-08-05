#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command, Option } from 'commander';
import { createGmailRuntime, runQuietly, type RuntimeOptions } from './runtime.js';
import { printEmailPage, printJson, printThread } from './output.js';

interface GlobalOptions extends RuntimeOptions {
  json?: boolean;
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received "${value}".`);
  }
  return parsed;
}

function globalOptions(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>();
}

async function withRuntime<T>(
  command: Command,
  action: (runtime: Awaited<ReturnType<typeof createGmailRuntime>>) => Promise<T>
): Promise<T> {
  const options = globalOptions(command);
  const runtime = await createGmailRuntime(options);

  try {
    return await runQuietly(options.verbose, () => action(runtime));
  } finally {
    await runtime.close();
  }
}

function escapeGmailPhrase(value: string): string {
  return value.replaceAll('\\', ' ').replaceAll('"', ' ');
}

async function confirmDelete(threadId: string): Promise<boolean> {
  if (!input.isTTY) {
    throw new Error('Refusing to delete non-interactively without --yes.');
  }

  const prompt = createInterface({ input, output });
  try {
    const answer = await prompt.question(`Move thread ${threadId} to trash? [y/N] `);
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    prompt.close();
  }
}

const program = new Command();

program
  .name('gmail-demo')
  .description('Manage Gmail threads with gmail-puppet')
  .version('0.1.0')
  .option('--env-file <path>', 'load credentials from a specific environment file')
  .option('--headed', 'show the browser while Gmail is being automated')
  .option('--json', 'write a stable JSON result to stdout')
  .option('--verbose', 'write gmail-puppet diagnostic logs to stderr');

program
  .command('list')
  .description('List one page of Gmail threads')
  .option('-q, --query <gmail-query>', 'Gmail search query')
  .option('-p, --page <number>', 'logical result page', positiveInteger, 1)
  .option('--page-size <number>', 'items per page (1-50)', positiveInteger, 20)
  .action(async (options, command: Command) => {
    const result = await withRuntime(command, ({ client }) =>
      client.searchEmailPage({
        query: options.query,
        page: options.page,
        pageSize: options.pageSize
      })
    );

    if (globalOptions(command).json) printJson(result);
    else printEmailPage(result);
  });

program
  .command('read')
  .description('Read every message in a Gmail thread')
  .argument('<thread-id>', 'Gmail thread ID')
  .option('--preserve-unread', 'leave the thread unread after reading it')
  .action(async (threadId: string, options, command: Command) => {
    const messages = await withRuntime(command, ({ client }) =>
      client.readThread(threadId, {
        setReadStatus: !options.preserveUnread
      })
    );
    const result = { threadId, messages };

    if (globalOptions(command).json) printJson(result);
    else printThread(threadId, messages);
  });

program
  .command('create')
  .description('Send a new email')
  .option('--to <email>', 'recipient email address')
  .option('--self', 'send to the configured Gmail account')
  .requiredOption('--subject <subject>', 'email subject')
  .option('--body <html>', 'HTML email body')
  .option('--body-file <path>', 'read the HTML email body from a file')
  .action(async (options, command: Command) => {
    if (Boolean(options.to) === Boolean(options.self)) {
      throw new Error('Provide exactly one of --to or --self.');
    }
    if (Boolean(options.body) === Boolean(options.bodyFile)) {
      throw new Error('Provide exactly one of --body or --body-file.');
    }

    const body = options.body ?? await readFile(options.bodyFile, 'utf8');
    const result = await withRuntime(command, async ({ client, accountEmail }) => {
      const to = options.self ? accountEmail : options.to;
      await client.sendEmail({
        to,
        subject: options.subject,
        htmlBody: body
      });

      const query = `in:sent subject:"${escapeGmailPhrase(options.subject)}"`;
      let threadId: string | null = null;

      for (let attempt = 0; attempt < 8 && !threadId; attempt++) {
        const matches = await client.searchEmails(query, 10);
        threadId = matches.find((email) => email.subject === options.subject)?.id ?? null;
        if (!threadId) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      return {
        action: 'created',
        threadId,
        to,
        subject: options.subject
      };
    });

    if (globalOptions(command).json) printJson(result);
    else {
      process.stdout.write(
        `Sent "${result.subject}" to ${result.to}${result.threadId ? ` (thread ${result.threadId})` : ''}.\n`
      );
    }
  });

program
  .command('reply')
  .description('Reply to an existing Gmail thread')
  .argument('<thread-id>', 'Gmail thread ID')
  .option('--body <html>', 'HTML email body')
  .option('--body-file <path>', 'read the HTML email body from a file')
  .action(async (threadId: string, options, command: Command) => {
    if (Boolean(options.body) === Boolean(options.bodyFile)) {
      throw new Error('Provide exactly one of --body or --body-file.');
    }

    const body = options.body ?? await readFile(options.bodyFile, 'utf8');
    const result = await withRuntime(command, async ({ client, accountEmail }) => {
      const messagesBeforeReply = await client.readThread(threadId, { setReadStatus: true });

      await client.sendEmail({
        replyToId: threadId,
        htmlBody: body
      });

      let messages = messagesBeforeReply;
      let verified = false;

      for (let attempt = 0; attempt < 4 && !verified; attempt++) {
        messages = await client.readThread(threadId, { setReadStatus: true });
        const newestMessage = messages.at(-1);
        verified =
          messages.length > messagesBeforeReply.length &&
          newestMessage?.senderEmail.toLowerCase() === accountEmail.toLowerCase();

        if (!verified && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      return {
        action: 'replied',
        threadId,
        verified,
        messageCount: messages.length
      };
    });

    if (globalOptions(command).json) printJson(result);
    else {
      process.stdout.write(
        `Replied to thread ${result.threadId}${result.verified ? ' (verified)' : ' (send confirmed; same-thread verification failed)'}.\n`
      );
    }
  });

program
  .command('update')
  .description('Update mutable Gmail thread state')
  .argument('<thread-id>', 'Gmail thread ID')
  .addOption(new Option('--read', 'mark the thread as read').conflicts('unread'))
  .addOption(new Option('--unread', 'mark the thread as unread').conflicts('read'))
  .action(async (threadId: string, options, command: Command) => {
    if (!options.read && !options.unread) {
      throw new Error('Provide either --read or --unread.');
    }

    const read = Boolean(options.read);
    await withRuntime(command, ({ client }) => client.setThreadReadStatus(threadId, read));
    const result = {
      action: 'updated',
      threadId,
      read
    };

    if (globalOptions(command).json) printJson(result);
    else process.stdout.write(`Thread ${threadId} marked as ${read ? 'read' : 'unread'}.\n`);
  });

program
  .command('delete')
  .description('Move a Gmail thread to trash')
  .argument('<thread-id>', 'Gmail thread ID')
  .option('-y, --yes', 'skip the confirmation prompt')
  .action(async (threadId: string, options, command: Command) => {
    const confirmed = options.yes || await confirmDelete(threadId);
    if (!confirmed) {
      process.stdout.write('Cancelled.\n');
      return;
    }

    await withRuntime(command, ({ client }) => client.trashThread(threadId));
    const result = {
      action: 'deleted',
      threadId,
      location: 'trash'
    };

    if (globalOptions(command).json) printJson(result);
    else process.stdout.write(`Thread ${threadId} moved to trash.\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
