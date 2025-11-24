import { randomUUID } from 'crypto';
import EventEmitter  from 'eventemitter3';
import { formatDuration, intervalToDuration } from 'date-fns';

export type ScraperEventStart = {
    id: string;
    name: string;
    payload: any;
    startTime: number; // in ms (Date.now())
};

export type ScraperEventEnd = {
    id:string;
    name: string;
    payload: any;
    startTime: number; // in ms
    endTime: number; // in ms
    duration: number; // in ms
    error?: any;
};

export class EventTracker {
    // @ts-ignore
    public events: EventEmitter;

    // @ts-ignore
    constructor(eventEmitter?: EventEmitter) {
        // @ts-ignore
        this.events = eventEmitter || new EventEmitter();
    }

    public startPerformanceLogging(logPrefix: string = ''): void {
        const prefix = logPrefix ? `[${logPrefix}] ` : '';

        this.events.on('start', (event: ScraperEventStart) => {
            const shortId = event.id.substring(0, 8);
            const payloadString = JSON.stringify(event.payload);
            console.log(`${prefix}▶️  Starting: ${event.name} (ID: ${shortId}) | Payload: ${payloadString}`);
        });

        this.events.on('end', (event: ScraperEventEnd) => {
            const shortId = event.id.substring(0, 8);
            const durationObject = intervalToDuration({ start: 0, end: event.duration });
            const formattedDuration = formatDuration(durationObject) || `${event.duration}ms`;

            if (event.error) {
                const errorMessage = event.error instanceof Error ? event.error.message : JSON.stringify(event.error);
                console.error(`${prefix}❌ Failed: ${event.name} (ID: ${shortId}) after ${formattedDuration} | Error: ${errorMessage}`);
            } else {
                console.log(`${prefix}✅ Finished: ${event.name} (ID: ${shortId}) in ${formattedDuration}.`);
            }
        });
    }
    public async trackOperation<T>(
        name: string,
        payload: any,
        action: () => Promise<T>
    ): Promise<T> {
        const id = randomUUID();
        const startTime = Date.now();

        this.events.emit('start', { id, name, payload, startTime } as ScraperEventStart);

        try {
            const result = await action();
            const endTime = Date.now();
            const duration = endTime - startTime;
            this.events.emit('end', { id, name, payload, duration, startTime, endTime } as ScraperEventEnd);
            return result;
        } catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            this.events.emit('end', { id, name, payload, duration, startTime, endTime, error } as ScraperEventEnd);
            throw error;
        }
    }
}
