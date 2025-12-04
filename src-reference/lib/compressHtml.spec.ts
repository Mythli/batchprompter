import { compressHtml } from './compressHtml.js';

describe('compressHtml', () => {
    it('should remove script tags and their content', () => {
        const html = '<html><head><script>alert("hello");</script></head><body><p>test</p></body></html>';
        const expected = '<html><head></head><body><p>test</p></body></html>';
        expect(compressHtml(html)).toBe(expected);
    });

    it('should remove style tags and their content', () => {
        const html = '<html><head><style>body { color: red; }</style></head><body><p>test</p></body></html>';
        const expected = '<html><head></head><body><p>test</p></body></html>';
        expect(compressHtml(html)).toBe(expected);
    });

    it('should remove HTML comments', () => {
        const html = '<html><body><!-- This is a comment --><p>test</p></body></html>';
        const expected = '<html><head></head><body><p>test</p></body></html>';
        expect(compressHtml(html)).toBe(expected);
    });

    it('should remove stylesheet link tags but preserve others', () => {
        const html = '<html><head><link rel="stylesheet" href="style.css"><link rel="icon" href="favicon.ico"></head><body></body></html>';
        const expected = '<html><head><link rel="icon" href="favicon.ico"></head><body></body></html>';
        expect(compressHtml(html)).toBe(expected);
    });

    it('should truncate long data URIs in src attributes', () => {
        const longDataUri = 'data:image/png;base64,' + 'a'.repeat(100);
        const html = `<html><body><img src="${longDataUri}"></body></html>`;
        const expected = `<html><head></head><body><img src="${longDataUri.substring(0, 80)}...[truncated]"></body></html>`;
        expect(compressHtml(html)).toBe(expected);
    });
});
