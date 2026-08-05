import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const cli = new URL('../dist/index.js', import.meta.url);

function run(...args) {
  return spawnSync(process.execPath, [cli.pathname, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GMAIL_EMAIL: '',
      GMAIL_PASSWORD: ''
    }
  });
}

describe('gmail-demo reply', () => {
  it('documents the thread-only reply interface', () => {
    const result = run('reply', '--help');

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: gmail-demo reply \[options\] <thread-id>/);
    assert.match(result.stdout, /--body <html>/);
    assert.match(result.stdout, /--body-file <path>/);
    assert.doesNotMatch(result.stdout, /--to|--subject|--self/);
  });

  it('requires exactly one body source before starting Gmail', () => {
    const missing = run('reply', 'thread-id');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Provide exactly one of --body or --body-file/);

    const conflicting = run(
      'reply',
      'thread-id',
      '--body',
      '<p>Hello</p>',
      '--body-file',
      '/tmp/reply.html'
    );
    assert.equal(conflicting.status, 1);
    assert.match(conflicting.stderr, /Provide exactly one of --body or --body-file/);
  });

  it('rejects new-message addressing options', () => {
    const recipient = run('reply', 'thread-id', '--body', '<p>Hello</p>', '--to', 'nobody@example.com');
    assert.equal(recipient.status, 1);
    assert.match(recipient.stderr, /unknown option '--to'/);

    const subject = run('reply', 'thread-id', '--body', '<p>Hello</p>', '--subject', 'Wrong');
    assert.equal(subject.status, 1);
    assert.match(subject.stderr, /unknown option '--subject'/);
  });
});
