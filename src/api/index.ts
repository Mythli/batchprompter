import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { zValidator } from '@hono/zod-validator'
import { LeadGenRequestSchema } from './schemas.js'
import { runLeadGenPipeline } from './lead-gen.js'

const app = new Hono()

app.post('/leads', zValidator('json', LeadGenRequestSchema), async (c) => {
  const request = c.req.valid('json')

  return streamSSE(c, async (stream) => {
    await runLeadGenPipeline(request, async (result) => {
      await stream.writeSSE({
        data: JSON.stringify(result),
        event: 'result',
        id: String(Date.now())
      })
    })
    await stream.writeSSE({
        data: 'DONE',
        event: 'close',
        id: String(Date.now())
    })
  })
})

const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
