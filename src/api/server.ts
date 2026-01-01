import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import generateRoutes from './routes/generate.js';
import runRoutes from './routes/run.js';

const app = new Hono();

app.route('/', generateRoutes);
app.route('/', runRoutes);

app.use('/*', serveStatic({
    root: './public',
}));

// Export for use or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = 3000;
    console.log(`Server is running on port ${port}`);
    serve({
        fetch: app.fetch,
        port
    });
}

export default app;
