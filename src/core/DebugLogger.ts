import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './events.js';

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
                case 'plugin':
                    // Legacy plugin logs
                    console.log(`${prefix} 🔌 ${payload.message}`);
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

        this.events.on('plugin:event', (payload) => {
            const prefix = `[Row ${payload.row}] [${payload.plugin}]`;
            const data = payload.data;

            // Formatter Registry
            if (payload.plugin === 'website-agent') {
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
            } else if (payload.plugin === 'image-search') {
                if (payload.event === 'query:generated') {
                    console.log(`${prefix} 🔍 Generated queries: ${data.queries?.join(', ')}`);
                } else if (payload.event === 'search:result') {
                    console.log(`${prefix} 📸 Found ${data.results?.length || 0} images for "${data.query}"`);
                } else if (payload.event === 'result:selected') {
                    console.log(`${prefix} ✨ Selected ${data.results?.length || 0} images.`);
                }
            } else if (payload.plugin === 'web-search') {
                if (payload.event === 'query:generated') {
                    console.log(`${prefix} 🔍 Generated queries: ${data.queries?.join(', ')}`);
                } else if (payload.event === 'search:result') {
                    console.log(`${prefix} 🌐 Found ${data.results?.length || 0} results for "${data.query}"`);
                } else if (payload.event === 'content:enrich') {
                    console.log(`${prefix} 📄 Enriched ${data.url}`);
                }
            } else if (payload.plugin === 'logo-scraper') {
                if (payload.event === 'found') {
                    console.log(`${prefix} 🎨 Found ${data.count} potential logos.`);
                } else if (payload.event === 'downloading') {
                    console.log(`${prefix} ⬇️ Downloading ${data.count} logos...`);
                } else if (payload.event === 'analyzing') {
                    console.log(`${prefix} 🧠 Analyzing ${data.count} logos...`);
                }
            } else if (payload.plugin === 'style-scraper') {
                if (payload.event === 'scraping') {
                    console.log(`${prefix} 🎨 Scraping styles from ${data.url}`);
                } else if (payload.event === 'interactive') {
                    console.log(`${prefix} 🖱️ Capturing interactive elements...`);
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
