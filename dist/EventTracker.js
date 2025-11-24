import { randomUUID } from 'crypto';
import EventEmitter from 'eventemitter3';
import { formatDuration, intervalToDuration } from 'date-fns';
export class EventTracker {
    // @ts-ignore
    events;
    // @ts-ignore
    constructor(eventEmitter) {
        // @ts-ignore
        this.events = eventEmitter || new EventEmitter();
    }
    startPerformanceLogging(logPrefix = '') {
        const prefix = logPrefix ? `[${logPrefix}] ` : '';
        this.events.on('start', (event) => {
            const shortId = event.id.substring(0, 8);
            const payloadString = JSON.stringify(event.payload);
            console.log(`${prefix}▶️  Starting: ${event.name} (ID: ${shortId}) | Payload: ${payloadString}`);
        });
        this.events.on('end', (event) => {
            const shortId = event.id.substring(0, 8);
            const durationObject = intervalToDuration({ start: 0, end: event.duration });
            const formattedDuration = formatDuration(durationObject) || `${event.duration}ms`;
            if (event.error) {
                const errorMessage = event.error instanceof Error ? event.error.message : JSON.stringify(event.error);
                console.error(`${prefix}❌ Failed: ${event.name} (ID: ${shortId}) after ${formattedDuration} | Error: ${errorMessage}`);
            }
            else {
                console.log(`${prefix}✅ Finished: ${event.name} (ID: ${shortId}) in ${formattedDuration}.`);
            }
        });
    }
    async trackOperation(name, payload, action) {
        const id = randomUUID();
        const startTime = Date.now();
        this.events.emit('start', { id, name, payload, startTime });
        try {
            const result = await action();
            const endTime = Date.now();
            const duration = endTime - startTime;
            this.events.emit('end', { id, name, payload, duration, startTime, endTime });
            return result;
        }
        catch (error) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            this.events.emit('end', { id, name, payload, duration, startTime, endTime, error });
            throw error;
        }
    }
}
