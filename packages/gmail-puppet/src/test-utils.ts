import * as dotenv from 'dotenv';
import { z } from 'zod';
import puppeteer, { Browser } from 'puppeteer';

// Load environment variables from .env.test first, falling back to .env if present
dotenv.config({ path: ['.env.test', '.env'] });

// Define the schema for required test environment variables
const envSchema = z.object({
  GMAIL_EMAIL: z.string().email("GMAIL_EMAIL must be a valid email address"),
  GMAIL_PASSWORD: z.string().min(1, "GMAIL_PASSWORD must not be empty"),
  // Default to false (headful/visible) for tests so we can see the execution
  PUPPETEER_HEADLESS: z.string().optional().default('false').transform(val => val === 'true'),
  // Default to 50ms delay between Puppeteer actions to make it easier to follow visually
  PUPPETEER_SLOW_MO: z.string().optional().default('0').transform(val => parseInt(val, 10)),
});

// Parse and validate the environment variables.
// This will throw a clear error if they are missing or invalid.
export const testEnv = envSchema.parse(process.env);

/**
 * Launches a Puppeteer browser instance configured for testing.
 */
export async function launchTestBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: testEnv.PUPPETEER_HEADLESS,
    slowMo: testEnv.PUPPETEER_SLOW_MO,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-custom-handlers', // Prevents the "Allow mail.google.com to open all email links?" prompt
      '--disable-notifications'    // Prevents notification permission prompts
    ]
  });
}
