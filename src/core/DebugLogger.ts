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
                    console.log(`${prefix} 💥 ${payload.message}`);
                    break;
                case 'generation':
                    console.log(`${prefix} 🤖 ${payload.message}`);
                    break;
                case 'plugin':
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
