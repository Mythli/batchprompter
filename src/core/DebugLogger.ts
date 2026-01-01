import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './events.js';

export class DebugLogger {
    constructor(private events: EventEmitter<BatchPromptEvents>) {
        this.setupListeners();
    }

    private setupListeners() {
        this.events.on('log', (payload) => {
            if (payload.level === 'error') {
                console.error(`[ERROR] ${payload.message}`);
            } else if (payload.level === 'warn') {
                console.warn(`[WARN] ${payload.message}`);
            } else {
                console.log(`[INFO] ${payload.message}`);
            }
        });

        this.events.on('step:progress', (payload) => {
            const prefix = `[Row ${payload.row}] Step ${payload.step}`;
            
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
        });
    }
}
