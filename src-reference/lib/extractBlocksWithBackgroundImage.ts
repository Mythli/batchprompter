import * as csstree from 'css-tree';

export interface Stylesheet {
    url: string;
    content: string;
}

/**
 * Parses an array of stylesheet objects and extracts all CSS rules that contain
 * a `background-image` or `background` property with a `url()`. It returns a
 * formatted string containing these rules, annotated with their source URL,
 * which can be passed to an LLM for analysis.
 *
 * @param stylesheets An array of objects, each with a `url` and `content`.
 * @returns A string containing unique, annotated CSS rules with background images, or an empty string if none are found.
 */
export function extractBlocksWithBackgroundImage(stylesheets: Stylesheet[]): string {
    if (!stylesheets || stylesheets.length === 0) {
        return '';
    }

    const allSnippets: string[] = [];

    for (const stylesheet of stylesheets) {
        if (!stylesheet.content) {
            continue;
        }

        try {
            const ast = csstree.parse(stylesheet.content, {
                onParseError: () => {
                    // Mute parsing errors, as some CSS might be invalid but we want to process the rest.
                }
            });

            const rulesWithBgImage: string[] = [];

            csstree.walk(ast, {
                visit: 'Declaration',
                enter: function(node) { // Changed to a regular function to access `this`
                    // The `this` context is provided by csstree.walk and contains parent info.
                    // When visiting a 'Declaration', `this.rule` will be its parent Rule.
                    if (!this.rule) {
                        return;
                    }

                    const property = node.property.toLowerCase();
                    if (property === 'background' || property === 'background-image') {
                        const value = csstree.generate(node.value);
                        if (value.includes('url(')) {
                            const ruleCss = csstree.generate(this.rule);
                            rulesWithBgImage.push(ruleCss);
                        }
                    }
                }
            });

            if (rulesWithBgImage.length > 0) {
                const uniqueRules = [...new Set(rulesWithBgImage)];
                const snippet = `/* Stylesheet source: ${stylesheet.url} */\n${uniqueRules.join('\n')}`;
                allSnippets.push(snippet);
            }
        } catch (e: any) {
            console.warn(`Failed to parse CSS from ${stylesheet.url} with css-tree: ${e.message}`);
        }
    }

    if (allSnippets.length === 0) {
        return '';
    }

    return allSnippets.join('\n\n');
}
