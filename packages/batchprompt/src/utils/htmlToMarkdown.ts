import TurndownService from 'turndown';

export function htmlToMarkdown(html: string): string {
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
    });

    // Remove scripts, styles, and other non-content elements
    turndownService.remove(['script', 'style', 'noscript', 'iframe']);

    return turndownService.turndown(html);
}
