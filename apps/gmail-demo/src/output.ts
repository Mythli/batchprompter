import type { EmailMetadata, EmailPage, ThreadMessage } from 'gmail-puppet';

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, width: number): string {
  const normalized = oneLine(value);
  return normalized.length <= width
    ? normalized
    : `${normalized.slice(0, Math.max(0, width - 1))}…`;
}

function row(email: EmailMetadata): string {
  const columns = [
    email.isUnread ? 'unread' : 'read',
    truncate(email.date, 18).padEnd(18),
    truncate(email.sender, 26).padEnd(26),
    truncate(email.subject || '(no subject)', 42).padEnd(42),
    email.id
  ];
  return columns.join('  ');
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printEmailPage(result: EmailPage): void {
  if (result.items.length === 0) {
    process.stdout.write(`No emails found on page ${result.page}.\n`);
    return;
  }

  process.stdout.write(
    [
      'STATUS  DATE                SENDER                      SUBJECT                                     THREAD ID',
      ...result.items.map(row),
      '',
      `Page ${result.page} · ${result.items.length} item(s) · previous: ${result.hasPreviousPage ? 'yes' : 'no'} · next: ${result.hasNextPage ? 'yes' : 'no'}`
    ].join('\n') + '\n'
  );
}

export function printThread(threadId: string, messages: ThreadMessage[]): void {
  const sections = messages.map((message, index) => {
    return [
      `Message ${index + 1}/${messages.length}`,
      `From: ${message.senderName || '(unknown)'} <${message.senderEmail || 'unknown'}>`,
      `Date: ${message.date || '(unknown)'}`,
      '',
      message.textBody || '(empty body)'
    ].join('\n');
  });

  process.stdout.write(
    [`Thread ${threadId}`, '='.repeat(60), ...sections].join('\n\n') + '\n'
  );
}
