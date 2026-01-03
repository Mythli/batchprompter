import { html } from 'hono/html'

export const Layout = (props: { children: any, title?: string }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{props.title || 'BatchPrompt'}</title>
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://cdn.tailwindcss.com"></script>
        <style dangerouslySetInnerHTML={{ __html: `
            .htmx-indicator { display: none; }
            .htmx-request .htmx-indicator { display: block; }
            .htmx-request.htmx-indicator { display: block; }
        `}} />
      </head>
      <body class="bg-gray-50 min-h-screen p-8">
        <div class="max-w-5xl mx-auto">
          {props.children}
        </div>
      </body>
    </html>
  )
}
