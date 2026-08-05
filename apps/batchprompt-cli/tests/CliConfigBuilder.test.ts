import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { CliConfigBuilder } from '../src/CliConfigBuilder.js';
import { StepRegistry } from '../src/StepRegistry.js';
import { WebSearchAdapter } from '../src/adapters/WebSearchAdapter.js';
import { ImageSearchAdapter } from '../src/adapters/ImageSearchAdapter.js';
import { WebsiteAgentAdapter } from '../src/adapters/WebsiteAgentAdapter.js';
import { ValidationAdapter } from '../src/adapters/ValidationAdapter.js';
import { DedupeAdapter } from '../src/adapters/DedupeAdapter.js';
import { UrlExpanderAdapter } from '../src/adapters/UrlExpanderAdapter.js';
import { ShellAdapter } from '../src/adapters/ShellAdapter.js';
import { LogoScraperAdapter } from '../src/adapters/LogoScraperAdapter.js';
import { StyleScraperAdapter } from '../src/adapters/StyleScraperAdapter.js';
import { LoadDataAdapter } from '../src/adapters/LoadDataAdapter.js';
import { GmailSenderAdapter } from '../src/adapters/GmailSenderAdapter.js';
import { GmailReplierAdapter } from '../src/adapters/GmailReplierAdapter.js';

describe('CLI raw config mapping', () => {
    it('accepts max reasoning effort for numbered steps', () => {
        const command = new Command().exitOverride();
        new StepRegistry([]).registerFlags(command);

        command.parse(['--1-thinking-level', 'max'], { from: 'user' });

        const rawConfig = CliConfigBuilder.build({}, command.opts(), [], []);
        expect(rawConfig.steps).toEqual([{ model: { thinkingLevel: 'max' }, plugins: [] }]);
    });

    it('maps numbered CLI flags to the exact equivalent initial JSON config', () => {
        const adapters = [
            new WebSearchAdapter(),
            new ImageSearchAdapter(),
            new WebsiteAgentAdapter(),
            new ValidationAdapter(),
            new DedupeAdapter(),
            new UrlExpanderAdapter(),
            new ShellAdapter(),
            new LogoScraperAdapter(),
            new StyleScraperAdapter(),
            new LoadDataAdapter(),
            new GmailSenderAdapter(),
            new GmailReplierAdapter()
        ];
        const command = new Command()
            .exitOverride()
            .argument('[prompts...]');
        new StepRegistry(adapters).registerFlags(command);

        command.parse([
            '--model', 'global-model',
            '--concurrency', '7',
            '--task-concurrency', '3',
            '--data-output-path', 'results/{{keyword}}.csv',
            '--timeout', '90',
            '--log-level', 'debug',
            '--output-path', 'artifacts/{{keyword}}.txt',
            '--output-mode', 'column',
            '--output-column', 'globalResult',
            '--output-explode',
            '--output-tmp-dir', '.tmp/global',
            '--output-limit', '20',
            '--output-offset', '2',
            '--input-limit', '50',
            '--input-offset', '5',

            '--1-model', 'step-model',
            '--1-prompt', 'prompt.md',
            '--1-system', 'system.md',
            '--1-temperature', '0.4',
            '--1-thinking-level', 'high',
            '--1-output-path', 'step/{{keyword}}.json',
            '--1-output-mode', 'column',
            '--1-output-column', 'stepResult',
            '--1-output-explode',
            '--1-output-limit', '8',
            '--1-output-offset', '1',
            '--1-candidates', '4',
            '--1-aspect-ratio', '16:9',
            '--1-timeout', '120',
            '--1-schema', 'schema.json',
            '--1-feedback-loops', '2',
            '--1-judge-prompt', 'judge.md',
            '--1-judge-model', 'judge-model',
            '--1-feedback-prompt', 'feedback.md',

            '--1-web-search-query', '{{keyword}}',
            '--1-web-search-limit', '12',
            '--1-web-search-mode', 'markdown',
            '--1-web-search-query-count', '2',
            '--1-web-search-max-pages', '3',
            '--1-web-search-dedupe-strategy', 'domain',
            '--1-web-search-gl', 'de',
            '--1-web-search-hl', 'de',
            '--1-web-search-query-model', 'query-model',
            '--1-web-search-query-prompt', 'query.md',
            '--1-web-search-select-model', 'select-model',
            '--1-web-search-select-prompt', 'select.md',
            '--1-web-search-compress-model', 'compress-model',
            '--1-web-search-compress-prompt', 'compress.md',
            '--1-web-search-output-mode', 'column',
            '--1-web-search-output-column', 'webResults',
            '--1-web-search-output-explode',

            '--1-image-search-query', '{{imageKeyword}}',
            '--1-image-search-limit', '9',
            '--1-image-search-query-count', '2',
            '--1-image-search-max-pages', '2',
            '--1-image-search-dedupe-strategy', 'url',
            '--1-image-search-gl', 'us',
            '--1-image-search-hl', 'en',
            '--1-image-search-tbs', 'sur:cl',
            '--1-image-search-query-model', 'image-query-model',
            '--1-image-search-query-prompt', 'image-query.md',
            '--1-image-search-select-model', 'image-select-model',
            '--1-image-search-select-prompt', 'image-select.md',
            '--1-image-search-output-mode', 'column',
            '--1-image-search-output-column', 'images',
            '--1-image-search-output-explode',

            '--1-website-agent-url', 'https://example.com/{{slug}}',
            '--1-website-agent-schema', 'website-schema.json',
            '--1-website-agent-budget', '6',
            '--1-website-agent-batch-size', '2',
            '--1-website-agent-navigator-model', 'navigator-model',
            '--1-website-agent-navigator-prompt', 'navigate.md',
            '--1-website-agent-extract-model', 'extract-model',
            '--1-website-agent-extract-prompt', 'extract.md',
            '--1-website-agent-merge-model', 'merge-model',
            '--1-website-agent-merge-prompt', 'merge.md',
            '--1-website-agent-output-mode', 'column',
            '--1-website-agent-output-column', 'website',

            '--1-validate-schema', 'validation-schema.json',
            '--1-validate-target', '{{stepResult}}',
            '--1-validate-fail-mode', 'continue',
            '--1-dedupe-key', '{{email}}',
            '--1-expand-urls',
            '--1-expand-urls-mode', 'puppeteer',
            '--1-expand-urls-max-chars', '12345',
            '--1-shell-command', 'echo {{slug}}',
            '--1-shell-verify-command', 'test -f {{path}}',
            '--1-shell-skip-candidate-command',

            '--1-logo-scraper-url', 'https://example.com/{{slug}}',
            '--1-logo-scraper-logo-output-path', 'logos/{{slug}}.png',
            '--1-logo-scraper-favicon-output-path', 'favicons/{{slug}}.ico',
            '--1-logo-scraper-max-logos', '15',
            '--1-logo-scraper-threshold', '7',
            '--1-logo-scraper-analyze-model', 'logo-analyze-model',
            '--1-logo-scraper-analyze-prompt', 'logo-analyze.md',
            '--1-logo-scraper-extract-model', 'logo-extract-model',
            '--1-logo-scraper-extract-prompt', 'logo-extract.md',
            '--1-logo-scraper-output-mode', 'column',
            '--1-logo-scraper-output-column', 'brand',
            '--1-logo-scraper-output-explode',

            '--1-style-scraper-url', 'https://example.com/{{slug}}',
            '--1-style-scraper-max-buttons', '4',
            '--1-style-scraper-max-inputs', '5',
            '--1-style-scraper-max-links', '6',
            '--1-style-scraper-scope-selector', '#app',
            '--1-style-scraper-no-composite',
            '--1-style-scraper-output-mode', 'column',
            '--1-style-scraper-output-column', 'styles',

            '--1-load-data-json', '[{"id":1},{"id":2}]',
            '--1-load-data-output-mode', 'column',
            '--1-load-data-output-column', 'loaded',
            '--1-load-data-output-explode',

            '--1-gmail-to', '{{email}}',
            '--1-gmail-subject', 'Hello {{name}}',
            '--1-gmail-body', 'Body {{name}}',
            '--1-gmail-reply-to-id', '{{threadId}}',
            '--1-gmail-delay-min', '1.5',
            '--1-gmail-delay-max', '3.5',
            '--1-gmail-send-if-received',
            '--1-gmail-skip-if-subject-match',
            '--1-gmail-reply-to-last-thread',
            '--1-gmail-require-existing-thread',
            '--1-gmail-evaluate-replies',
            '--1-gmail-evaluation-model', 'email-eval-model',
            '--1-gmail-evaluation-prompt', 'email-eval.md',
            '--1-gmail-output-mode', 'column',
            '--1-gmail-output-column', 'sent',
            '--1-gmail-output-explode',

            '--1-gmail-replier-target-query', 'is:unread',
            '--1-gmail-replier-limit', '25',
            '--1-gmail-replier-inspiration-query', 'from:me',
            '--1-gmail-replier-inspiration-limit', '4',
            '--1-gmail-replier-draft-model', 'draft-model',
            '--1-gmail-replier-draft-prompt', 'draft.md',
            '--1-gmail-replier-evaluate-reply',
            '--1-gmail-replier-evaluate-model', 'reply-eval-model',
            '--1-gmail-replier-evaluate-prompt', 'reply-eval.md',
            '--1-gmail-replier-interactive',
            '--1-gmail-replier-auto-send',
            '--1-gmail-replier-output-mode', 'column',
            '--1-gmail-replier-output-column', 'replies',
            '--1-gmail-replier-output-explode'
        ], { from: 'user' });

        const rawConfig = CliConfigBuilder.build(
            {},
            command.opts(),
            command.processedArgs[0] ?? [],
            adapters
        );

        expect(command.options.some(option => option.long === '--web-search-query')).toBe(false);
        expect(rawConfig).toEqual({
            model: 'global-model',
            concurrency: 7,
            taskConcurrency: 3,
            dataOutputPath: 'results/{{keyword}}.csv',
            timeout: 90,
            logLevel: 'debug',
            output: {
                path: 'artifacts/{{keyword}}.txt',
                mode: 'column',
                column: 'globalResult',
                explode: true,
                tmpDir: '.tmp/global',
                limit: 20,
                offset: 2
            },
            inputLimit: 50,
            inputOffset: 5,
            steps: [{
                model: {
                    model: 'step-model',
                    prompt: 'prompt.md',
                    system: 'system.md',
                    temperature: 0.4,
                    thinkingLevel: 'high'
                },
                output: {
                    path: 'step/{{keyword}}.json',
                    mode: 'column',
                    column: 'stepResult',
                    explode: true,
                    limit: 8,
                    offset: 1
                },
                candidates: 4,
                aspectRatio: '16:9',
                timeout: 120,
                schema: 'schema.json',
                feedbackLoops: 2,
                judge: {
                    prompt: 'judge.md',
                    model: 'judge-model'
                },
                feedback: {
                    prompt: 'feedback.md'
                },
                plugins: [
                    {
                        type: 'webSearch',
                        query: '{{keyword}}',
                        limit: 12,
                        mode: 'markdown',
                        queryCount: 2,
                        maxPages: 3,
                        dedupeStrategy: 'domain',
                        gl: 'de',
                        hl: 'de',
                        queryModel: {
                            model: 'query-model',
                            prompt: 'query.md'
                        },
                        selectModel: {
                            model: 'select-model',
                            prompt: 'select.md'
                        },
                        compressModel: {
                            model: 'compress-model',
                            prompt: 'compress.md'
                        },
                        output: {
                            mode: 'column',
                            column: 'webResults',
                            explode: true
                        }
                    },
                    {
                        type: 'imageSearch',
                        query: '{{imageKeyword}}',
                        limit: 9,
                        queryCount: 2,
                        maxPages: 2,
                        dedupeStrategy: 'url',
                        gl: 'us',
                        hl: 'en',
                        tbs: 'sur:cl',
                        queryModel: {
                            model: 'image-query-model',
                            prompt: 'image-query.md'
                        },
                        selectModel: {
                            model: 'image-select-model',
                            prompt: 'image-select.md'
                        },
                        output: {
                            mode: 'column',
                            column: 'images',
                            explode: true
                        }
                    },
                    {
                        type: 'websiteAgent',
                        url: 'https://example.com/{{slug}}',
                        schema: 'website-schema.json',
                        budget: 6,
                        batchSize: 2,
                        navigatorModel: {
                            model: 'navigator-model',
                            prompt: 'navigate.md'
                        },
                        extractModel: {
                            model: 'extract-model',
                            prompt: 'extract.md'
                        },
                        mergeModel: {
                            model: 'merge-model',
                            prompt: 'merge.md'
                        },
                        output: {
                            mode: 'column',
                            column: 'website'
                        }
                    },
                    {
                        type: 'validation',
                        schema: 'validation-schema.json',
                        target: '{{stepResult}}',
                        failMode: 'continue'
                    },
                    {
                        type: 'dedupe',
                        key: '{{email}}'
                    },
                    {
                        type: 'shell-command',
                        command: 'echo {{slug}}',
                        verifyCommand: 'test -f {{path}}',
                        skipCandidateCommand: true
                    },
                    {
                        type: 'logoScraper',
                        url: 'https://example.com/{{slug}}',
                        logoOutputPath: 'logos/{{slug}}.png',
                        faviconOutputPath: 'favicons/{{slug}}.ico',
                        maxLogosToAnalyze: 15,
                        brandLogoScoreThreshold: 7,
                        analyzeModel: {
                            model: 'logo-analyze-model',
                            prompt: 'logo-analyze.md'
                        },
                        extractModel: {
                            model: 'logo-extract-model',
                            prompt: 'logo-extract.md'
                        },
                        output: {
                            mode: 'column',
                            column: 'brand',
                            explode: true
                        }
                    },
                    {
                        type: 'styleScraper',
                        url: 'https://example.com/{{slug}}',
                        maxButtons: 4,
                        maxInputs: 5,
                        maxLinks: 6,
                        scopeSelector: '#app',
                        createCompositeImage: false,
                        output: {
                            mode: 'column',
                            column: 'styles'
                        }
                    },
                    {
                        type: 'loadData',
                        data: [{ id: 1 }, { id: 2 }],
                        output: {
                            mode: 'column',
                            column: 'loaded',
                            explode: true
                        }
                    },
                    {
                        type: 'gmailSender',
                        body: 'Body {{name}}',
                        to: '{{email}}',
                        subject: 'Hello {{name}}',
                        replyToId: '{{threadId}}',
                        delayMin: 1.5,
                        delayMax: 3.5,
                        sendIfReceived: true,
                        skipIfSubjectMatch: true,
                        replyToLastThread: true,
                        requireExistingThread: true,
                        evaluateReplies: true,
                        evaluationModel: {
                            model: 'email-eval-model',
                            prompt: 'email-eval.md'
                        },
                        output: {
                            mode: 'column',
                            column: 'sent',
                            explode: true
                        }
                    },
                    {
                        type: 'gmailReplier',
                        targetQuery: 'is:unread',
                        limit: 25,
                        inspirationQuery: 'from:me',
                        inspirationLimit: 4,
                        interactive: true,
                        autoSend: true,
                        evaluateReply: true,
                        draftModel: {
                            model: 'draft-model',
                            prompt: 'draft.md'
                        },
                        evaluateModel: {
                            model: 'reply-eval-model',
                            prompt: 'reply-eval.md'
                        },
                        output: {
                            mode: 'column',
                            column: 'replies',
                            explode: true
                        }
                    }
                ],
                expandUrls: {
                    mode: 'puppeteer',
                    maxChars: 12345
                }
            }]
        });
    });
});
