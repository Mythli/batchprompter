// @ts-ignore
import * as csstree from 'css-tree';

export interface Stylesheet {
    url: string;
    content: string;
}

export class CssParser {
    static extractBlocksWithBackgroundImage(stylesheets: Stylesheet[]): string {
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
                        // Mute parsing errors
                    }
                });

                const rulesWithBgImage: string[] = [];

                csstree.walk(ast, {
                    visit: 'Declaration',
                    enter: function(node: any) {
                        // @ts-ignore - csstree types might be loose here regarding 'this' context in walk
                        if (!this.rule) {
                            return;
                        }

                        const property = node.property.toLowerCase();
                        if (property === 'background' || property === 'background-image') {
                            const value = csstree.generate(node.value);
                            if (value.includes('url(')) {
                                // @ts-ignore
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
                // console.warn(`Failed to parse CSS from ${stylesheet.url}: ${e.message}`);
            }
        }

        if (allSnippets.length === 0) {
            return '';
        }

        return allSnippets.join('\n\n');
    }
}
