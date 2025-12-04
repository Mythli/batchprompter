import { extractBlocksWithBackgroundImage, Stylesheet } from './extractBlocksWithBackgroundImage.js';

describe('extractBlocksWithBackgroundImage', () => {
    it('should return an empty string if stylesheets array is empty, null, or content is empty', () => {
        expect(extractBlocksWithBackgroundImage(null as any)).toBe('');
        expect(extractBlocksWithBackgroundImage([])).toBe('');
        expect(extractBlocksWithBackgroundImage([{ url: 'test.css', content: '' }])).toBe('');
    });

    it('should return an empty string if no background images are found', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: `
                .class1 { color: red; }
                .class2 { background-color: blue; }
            `
        }];
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe('');
    });

    it('should extract a simple rule with background-image', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: '.logo { background-image: url("logo.png"); }'
        }];
        const expected = `/* Stylesheet source: test.css */\n.logo{background-image:url(logo.png)}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });

    it('should extract a simple rule with shorthand background property', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: '.header { background: #fff url(/images/bg.jpg) no-repeat; }'
        }];
        // csstree.generate preserves the space before `no-repeat`
        const expected = `/* Stylesheet source: test.css */\n.header{background:#fff url(/images/bg.jpg)no-repeat}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });

    it('should extract multiple rules and ignore irrelevant ones', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: `
                .hero { background: url('hero.jpg'); }
                body { font-size: 16px; }
                .icon { background-image: url('icon.svg'); }
            `
        }];
        const expected = `/* Stylesheet source: test.css */\n.hero{background:url(hero.jpg)}\n.icon{background-image:url(icon.svg)}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });

    it('should handle data URIs in background images', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: '.logo-inline { background-image: url(data:image/svg+xml;base64,PHN2ZyB...); }'
        }];
        const expected = `/* Stylesheet source: test.css */\n.logo-inline{background-image:url(data:image/svg+xml;base64,PHN2ZyB...)}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });

    it('should handle duplicate rules, keeping only one instance', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: `
                .logo { background-image: url("logo.png"); }
                .logo { background-image: url("logo.png"); }
            `
        }];
        const expected = `/* Stylesheet source: test.css */\n.logo{background-image:url(logo.png)}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });

    it('should not throw on malformed CSS and should process what it can', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: `
                .valid-logo { background: url('logo.png'); }
                .malformed { color: ; font-size: 1rem; }
                .another-valid { background-image: url('another.png'); }
            `
        }];
        const expected = `/* Stylesheet source: test.css */\n.valid-logo{background:url(logo.png)}\n.another-valid{background-image:url(another.png)}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });

    it('should extract a rule with multiple properties including background-image', () => {
        const stylesheets: Stylesheet[] = [{
            url: 'test.css',
            content: `
                .complex {
                    color: white;
                    background-image: url("bg.gif");
                    padding: 10px;
                }
            `
        }];
        const expected = `/* Stylesheet source: test.css */\n.complex{color:white;background-image:url(bg.gif);padding:10px}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });

    it('should handle multiple stylesheets and join them with newlines', () => {
        const stylesheets: Stylesheet[] = [
            { url: 'style1.css', content: '.logo { background-image: url("logo.png"); }' },
            { url: 'style2.css', content: '.header { background: url("header.jpg"); }' }
        ];
        const expected = `/* Stylesheet source: style1.css */\n.logo{background-image:url(logo.png)}\n\n/* Stylesheet source: style2.css */\n.header{background:url(header.jpg)}`;
        expect(extractBlocksWithBackgroundImage(stylesheets)).toBe(expected);
    });
});
