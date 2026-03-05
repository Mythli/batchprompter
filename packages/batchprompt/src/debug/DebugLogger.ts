import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../events.js';

export class DebugLogger {
    constructor(private events: EventEmitter<BatchPromptEvents>) {
        this.setupListeners();
    }

    private setupListeners() {
        this.events.on('step:progress', (payload) => {
            const prefix = payload.row >= 0 ? `[Row ${payload.row}] Step ${payload.step}` : `[Global]`;

            switch (payload.type) {
                case 'explode':
                    let msg = payload.message;
                    if (!msg && payload.data) {
                        const { total, count, limit, offset } = payload.data;
                        msg = `Exploded ${total} items into ${count}`;
                        const details: string[] = [];
                        if (offset) details.push(`Offset: ${offset}`);
                        if (limit) details.push(`Limit: ${limit}`);
                        if (details.length > 0) {
                            msg += ` (${details.join(', ')})`;
                        }
                    }
                    console.log(`${prefix} 💥 ${msg}`);
                    break;
                case 'generation':
                    console.log(`${prefix} 🤖 ${payload.message}`);
                    break;
                case 'error':
                    console.error(`${prefix} ❌ ${payload.message}`);
                    if (payload.data instanceof Error) {
                        console.error(payload.data);
                    } else if (payload.data && payload.data.error instanceof Error) {
                        console.error(payload.data.error);
                    }
                    break;
                case 'warn':
                    console.warn(`${prefix} ⚠️ ${payload.message}`);
                    break;
                case 'info':
                case 'status':
                default:
                    console.log(`${prefix} ${payload.message}`);
                    break;
            }
        });

        this.events.on('step:resolved', (payload) => {
            const prefix = `[Row ${payload.row}] Step ${payload.step}`;

            // Log Prompt Summary
            if (payload.config.userPromptParts) {
                const promptText = payload.config.userPromptParts
                    .map((p: any) => p.text || '[Image/Audio]')
                    .join('')
                    .replace(/\n/g, ' ')
                    .substring(0, 100);
                console.log(`${prefix} [Step Resolved] Prompt: "${promptText}..."`);
            }

            // Log Schema if present
            if (payload.config.schema) {
                console.log(`${prefix} [Step Resolved] Schema: ${JSON.stringify(payload.config.schema)}`);
            }

            // Log Context Keys (useful to see what variables are available)
            const keys = Object.keys(payload.context).join(', ');
            console.log(`${prefix} [Step Resolved] Context Keys: [${keys}]`);
        });

        this.events.on('validation:failed', (payload) => {
            const prefix = `[Row ${payload.row}] Step ${payload.step}`;
            console.log(`${prefix} [Validation] ❌ Schema Violation`);
            console.log(`${prefix} [Validation] Expected Schema: ${JSON.stringify(payload.schema)}`);
            console.log(`${prefix} [Validation] Received Data: ${JSON.stringify(payload.data)}`);
            console.log(`${prefix} [Validation] Errors: ${JSON.stringify(payload.errors)}`);
        });

        this.events.on('plugin:event', (payload) => {
            const prefix = `[Row ${payload.row}] [${payload.plugin}]`;
            const data = payload.data;

            if (payload.plugin === 'websiteAgent') {
                if (payload.event === 'page:scraped') {
                    console.log(`${prefix} 🌍 Visited ${data.url} (${data.html?.length || 0} chars)`);
                } else if (payload.event === 'decision:made') {
                    const next = data.response?.next_urls?.length || 0;
                    const done = data.response?.is_done ? 'Done' : 'Continuing';
                    console.log(`${prefix} 🧠 Decision: ${done}. Next: ${next} URLs.`);
                } else if (payload.event === 'results:merged') {
                    console.log(`${prefix} 🧬 Merged ${data.results?.length || 0} results.`);
                } else if (payload.event === 'start') {
                    console.log(`${prefix} 🚀 Starting at ${data.url} (Budget: ${data.budget})`);
                } else if (payload.event === 'stop') {
                    console.log(`${prefix} 🛑 Stopping. Done: ${data.isDone}, Next URLs: ${data.nextUrls?.length}`);
                } else if (payload.event === 'batch') {
                    console.log(`${prefix} 📦 Processing batch: ${data.urls?.join(', ')}`);
                } else if (payload.event === 'error') {
                    console.warn(`${prefix} ⚠️ Error: ${data.message}`);
                }
            } else if (payload.plugin === 'dedupe') {
                if (payload.event === 'duplicate:found') {
                    console.log(`${prefix} ❌ Dropping duplicate: "${data.key}"`);
                } else if (payload.event === 'duplicate:kept') {
                    console.log(`${prefix} ✅ Keeping: "${data.key}"`);
                }
            } else if (payload.plugin === 'validation') {
                if (payload.event === 'validation:failed') {
                    console.log(`${prefix} ❌ Failed (${data.source}): ${data.errors}`);
                } else if (payload.event === 'validation:passed') {
                    console.log(`${prefix} ✅ Passed (${data.source})`);
                }
            } else if (payload.plugin === 'imageSearch') {
                if (payload.event === 'query:generated') {
                    console.log(`${prefix} 🔍 Generated queries: ${data.queries?.join(', ')}`);
                } else if (payload.event === 'search:result') {
                    console.log(`${prefix} 📸 Found ${data.results?.length || 0} images for "${data.query}"`);
                } else if (payload.event === 'result:selected') {
                    console.log(`${prefix} ✨ Selected ${data.results?.length || 0} images.`);
                }
            } else if (payload.plugin === 'webSearch') {
                if (payload.event === 'query:generated') {
                    console.log(`${prefix} 🔍 Generated queries: ${data.queries?.join(', ')}`);
                } else if (payload.event === 'search:result') {
                    console.log(`${prefix} 🌐 Found ${data.results?.length || 0} results for "${data.query}"`);
                } else if (payload.event === 'content:enrich') {
                    console.log(`${prefix} 📄 Enriched ${data.url}`);
                }
            } else if (payload.plugin === 'logoScraper') {
                if (payload.event === 'found') {
                    console.log(`${prefix} 🎨 Found ${data.count} potential logos.`);
                } else if (payload.event === 'downloading') {
                    console.log(`${prefix} ⬇️ Downloading ${data.count} logos...`);
                } else if (payload.event === 'analyzing') {
                    console.log(`${prefix} 🧠 Analyzing ${data.count} logos...`);
                }
            } else if (payload.plugin === 'styleScraper') {
                if (payload.event === 'scraping') {
                    console.log(`${prefix} 🎨 Scraping styles from ${data.url}`);
                } else if (payload.event === 'interactive') {
                    console.log(`${prefix} 🖱️ Capturing interactive elements...`);
                }
            } else if (payload.plugin === 'gmailSender') {
                if (payload.event === 'delay:started') {
                    console.log(`${prefix} ⏳ Waiting ${data.delayMinutes.toFixed(2)} minutes before sending...`);
                } else if (payload.event === 'search:started') {
                    console.log(`${prefix} 🔍 Searching for existing threads: ${data.query}`);
                } else if (payload.event === 'send:skipped') {
                    console.log(`${prefix} ⏭️ Skipped sending to ${data.to}: ${data.reason}`);
                } else if (payload.event === 'send:started') {
                    console.log(`${prefix} 📧 Sending email to ${data.to || 'thread ' + data.replyToId}...`);
                } else if (payload.event === 'send:success') {
                    console.log(`${prefix} ✅ Email sent successfully.`);
                } else if (payload.event === 'send:error') {
                    console.log(`${prefix} ❌ Failed to send email: ${data.error}`);
                }
            } else {
                // Default fallback
                console.log(`${prefix} ${payload.event}`);
            }
        });

        this.events.on('step:finish', (payload) => {
             // Optional: Log step completion if not covered by progress
             // console.log(`[Row ${payload.row}] Step ${payload.step} ✅ Finished`);
        });

        this.events.on('row:error', (payload) => {
            console.error(`[Row ${payload.index}] ❌ Failed: ${payload.error.message}`);
            console.error(payload.error);
        });
    }
}
