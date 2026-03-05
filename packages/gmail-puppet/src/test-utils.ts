import * as dotenv from 'dotenv';
import { z } from 'zod';
import puppeteer, { Browser } from 'puppeteer';

// Load environment variables from .env.test first, falling back to .env if present
dotenv.config({ path: ['.env.test', '.env'] });

// Define the schema for required test environment variables
const envSchema = z.object({
  GMAIL_EMAIL: z.string().email("GMAIL_EMAIL must be a valid email address"),
  GMAIL_PASSWORD: z.string().min(1, "GMAIL_PASSWORD must not be empty"),
});

// Parse and validate the environment variables. 
// This will throw a clear error if they are missing or invalid.
export const testEnv = envSchema.parse(process.env);

/**
 * Launches a Puppeteer browser instance configured for testing.
 */
export async function launchTestBrowser(): Promise<Browser> {
  return puppeteer.launch({
    // Use headless: false if you need to visually debug the login flow locally
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}
