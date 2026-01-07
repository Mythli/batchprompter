import PQueue from 'p-queue';

export function attachQueueLogger(queue: PQueue, name: string) {
    queue.on('active', () => {
        console.log(`[Queue:${name}] Active. Pending: ${queue.pending} | Queue: ${queue.size}`);
    });

    queue.on('completed', (result: any) => {
        // Some tasks might return an object with an ID, others might not.
        // We try to extract an ID if available for better logs, but keep it generic.
        const id = result?.id ? ` (ID: ${result.id})` : '';
        console.log(`[Queue:${name}] Task completed${id}. Pending: ${queue.pending} | Queue: ${queue.size}`);
    });

    queue.on('error', (error) => {
        console.error(`[Queue:${name}] Task error:`, error);
    });
}
