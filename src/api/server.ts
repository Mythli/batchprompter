import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import generateRoutes from './routes/generate.js';
import runRoutes from './routes/run.js';
import uiRoutes from './routes/ui.js';

const app = new Hono();

// API Routes
app.route('/api', generateRoutes);
app.route('/api', runRoutes);

// UI Routes
app.route('/ui', uiRoutes);

// Redirect root to UI
app.get('/', (c) => c.redirect('/ui'));

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
