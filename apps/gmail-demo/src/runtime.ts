import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import puppeteer, { type Browser } from 'puppeteer';
import { createGmailClient, type GmailClient } from 'gmail-puppet';

export interface RuntimeOptions {
  envFile?: string;
  headed?: boolean;
  verbose?: boolean;
}

export interface GmailRuntime {
  client: GmailClient;
  accountEmail: string;
  close: () => Promise<void>;
}

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDirectory = resolve(appDirectory, '../..');

export function resolveBrowserUserDataDir(): string {
  const configuredDirectory =
    process.env.BATCHPROMPT_PUPPETEER_USER_DATA_DIR ??
    process.env.PUPPETEER_USER_DATA_DIR;

  if (configuredDirectory?.trim()) {
    return resolve(process.cwd(), configuredDirectory.trim());
  }

  return resolve(workspaceDirectory, 'puppeteer_user_data/gmail-demo');
}

function loadEnvironment(explicitEnvFile?: string): void {
  const candidates = explicitEnvFile
    ? [resolve(process.cwd(), explicitEnvFile)]
    : [
        resolve(process.cwd(), '.env'),
        resolve(appDirectory, '.env'),
        resolve(workspaceDirectory, '.env'),
        resolve(workspaceDirectory, '.env.tobias')
      ];

  for (const candidate of new Set(candidates)) {
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
    }
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export async function createGmailRuntime(options: RuntimeOptions): Promise<GmailRuntime> {
  loadEnvironment(options.envFile);

  const accountEmail = process.env.GMAIL_EMAIL;
  const password = process.env.GMAIL_PASSWORD;

  if (!accountEmail || !password) {
    throw new Error(
      'GMAIL_EMAIL and GMAIL_PASSWORD are required. Set them in the environment or pass --env-file.'
    );
  }

  const headless = options.headed
    ? false
    : parseBoolean(
        process.env.BATCHPROMPT_PUPPETEER_HEADLESS ?? process.env.PUPPETEER_HEADLESS,
        true
      );

  const browser: Browser = await puppeteer.launch({
    headless,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    userDataDir: resolveBrowserUserDataDir(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-custom-handlers',
      '--disable-notifications'
    ]
  });

  const client = createGmailClient({
    email: accountEmail,
    password,
    usePage: async (action) => {
      const page = await browser.newPage();
      try {
        return await action(page);
      } finally {
        await page.close().catch(() => {});
      }
    }
  });

  return {
    client,
    accountEmail,
    close: async () => {
      await client.close();
      await browser.close();
    }
  };
}

export async function runQuietly<T>(
  verbose: boolean | undefined,
  action: () => Promise<T>
): Promise<T> {
  const originalLog = console.log;
  console.log = verbose ? (...args: unknown[]) => console.error(...args) : () => {};

  try {
    return await action();
  } finally {
    console.log = originalLog;
  }
}
