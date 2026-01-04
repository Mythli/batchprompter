import { z } from 'zod';
import { Plugin, PluginExecutionContext, PluginResult, CLIOptionDefinition } from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig, ResolvedModelConfig } from '../../config/types.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
export declare const LogoScraperConfigSchemaV2: z.ZodObject<{
    type: z.ZodLiteral<"logo-scraper">;
    id: z.ZodOptional<z.ZodString>;
    output: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["merge", "column", "ignore"]>>;
        column: z.ZodOptional<z.ZodString>;
        explode: z.ZodDefault<z.ZodBoolean>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    }, {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    }>>;
    url: z.ZodEffects<z.ZodString, string, string>;
    analyzeModel: z.ZodOptional<z.ZodString>;
    analyzeTemperature: z.ZodOptional<z.ZodNumber>;
    analyzeThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    analyzePrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio";
            content: string;
        }, {
            type: "text" | "image" | "audio";
            content: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }>]>>;
    analyzeSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio";
            content: string;
        }, {
            type: "text" | "image" | "audio";
            content: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }>]>>;
    extractModel: z.ZodOptional<z.ZodString>;
    extractTemperature: z.ZodOptional<z.ZodNumber>;
    extractThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
    extractPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio";
            content: string;
        }, {
            type: "text" | "image" | "audio";
            content: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }>]>>;
    extractSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
        file: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio"]>;
            content: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio";
            content: string;
        }, {
            type: "text" | "image" | "audio";
            content: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }, {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    }>]>>;
    maxCandidates: z.ZodDefault<z.ZodNumber>;
    minScore: z.ZodDefault<z.ZodNumber>;
    logoPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    faviconPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    logoLimit: z.ZodDefault<z.ZodNumber>;
    faviconLimit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "logo-scraper";
    output: {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    };
    url: string;
    maxCandidates: number;
    minScore: number;
    logoLimit: number;
    faviconLimit: number;
    id?: string | undefined;
    extractModel?: string | undefined;
    extractTemperature?: number | undefined;
    extractThinkingLevel?: "high" | "low" | "medium" | undefined;
    extractPrompt?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    extractSystem?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    analyzeModel?: string | undefined;
    analyzeTemperature?: number | undefined;
    analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
    analyzePrompt?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    analyzeSystem?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    logoPath?: string | undefined;
    faviconPath?: string | undefined;
}, {
    type: "logo-scraper";
    url: string;
    output?: {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    } | undefined;
    id?: string | undefined;
    extractModel?: string | undefined;
    extractTemperature?: number | undefined;
    extractThinkingLevel?: "high" | "low" | "medium" | undefined;
    extractPrompt?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    extractSystem?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    analyzeModel?: string | undefined;
    analyzeTemperature?: number | undefined;
    analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
    analyzePrompt?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    analyzeSystem?: string | {
        text?: string | undefined;
        file?: string | undefined;
        parts?: {
            type: "text" | "image" | "audio";
            content: string;
        }[] | undefined;
    } | undefined;
    maxCandidates?: number | undefined;
    minScore?: number | undefined;
    logoPath?: string | undefined;
    faviconPath?: string | undefined;
    logoLimit?: number | undefined;
    faviconLimit?: number | undefined;
}>;
export type LogoScraperRawConfigV2 = z.infer<typeof LogoScraperConfigSchemaV2>;
export interface LogoScraperResolvedConfigV2 {
    type: 'logo-scraper';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    analyzeModel: ResolvedModelConfig;
    extractModel: ResolvedModelConfig;
    maxCandidates: number;
    minScore: number;
    logoPath?: string;
    faviconPath?: string;
    logoLimit: number;
    faviconLimit: number;
}
export declare class LogoScraperPluginV2 implements Plugin<LogoScraperRawConfigV2, LogoScraperResolvedConfigV2> {
    readonly type = "logo-scraper";
    readonly configSchema: z.ZodObject<{
        type: z.ZodLiteral<"logo-scraper">;
        id: z.ZodOptional<z.ZodString>;
        output: z.ZodDefault<z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<["merge", "column", "ignore"]>>;
            column: z.ZodOptional<z.ZodString>;
            explode: z.ZodDefault<z.ZodBoolean>;
            limit: z.ZodOptional<z.ZodNumber>;
            offset: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        }, {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        }>>;
        url: z.ZodEffects<z.ZodString, string, string>;
        analyzeModel: z.ZodOptional<z.ZodString>;
        analyzeTemperature: z.ZodOptional<z.ZodNumber>;
        analyzeThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        analyzePrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
            file: z.ZodOptional<z.ZodString>;
            text: z.ZodOptional<z.ZodString>;
            parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["text", "image", "audio"]>;
                content: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "text" | "image" | "audio";
                content: string;
            }, {
                type: "text" | "image" | "audio";
                content: string;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }>]>>;
        analyzeSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
            file: z.ZodOptional<z.ZodString>;
            text: z.ZodOptional<z.ZodString>;
            parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["text", "image", "audio"]>;
                content: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "text" | "image" | "audio";
                content: string;
            }, {
                type: "text" | "image" | "audio";
                content: string;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }>]>>;
        extractModel: z.ZodOptional<z.ZodString>;
        extractTemperature: z.ZodOptional<z.ZodNumber>;
        extractThinkingLevel: z.ZodOptional<z.ZodEnum<["low", "medium", "high"]>>;
        extractPrompt: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
            file: z.ZodOptional<z.ZodString>;
            text: z.ZodOptional<z.ZodString>;
            parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["text", "image", "audio"]>;
                content: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "text" | "image" | "audio";
                content: string;
            }, {
                type: "text" | "image" | "audio";
                content: string;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }>]>>;
        extractSystem: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodObject<{
            file: z.ZodOptional<z.ZodString>;
            text: z.ZodOptional<z.ZodString>;
            parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
                type: z.ZodEnum<["text", "image", "audio"]>;
                content: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: "text" | "image" | "audio";
                content: string;
            }, {
                type: "text" | "image" | "audio";
                content: string;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }, {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        }>]>>;
        maxCandidates: z.ZodDefault<z.ZodNumber>;
        minScore: z.ZodDefault<z.ZodNumber>;
        logoPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        faviconPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        logoLimit: z.ZodDefault<z.ZodNumber>;
        faviconLimit: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "logo-scraper";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        url: string;
        maxCandidates: number;
        minScore: number;
        logoLimit: number;
        faviconLimit: number;
        id?: string | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeModel?: string | undefined;
        analyzeTemperature?: number | undefined;
        analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
        analyzePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        logoPath?: string | undefined;
        faviconPath?: string | undefined;
    }, {
        type: "logo-scraper";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        extractModel?: string | undefined;
        extractTemperature?: number | undefined;
        extractThinkingLevel?: "high" | "low" | "medium" | undefined;
        extractPrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        extractSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeModel?: string | undefined;
        analyzeTemperature?: number | undefined;
        analyzeThinkingLevel?: "high" | "low" | "medium" | undefined;
        analyzePrompt?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        analyzeSystem?: string | {
            text?: string | undefined;
            file?: string | undefined;
            parts?: {
                type: "text" | "image" | "audio";
                content: string;
            }[] | undefined;
        } | undefined;
        maxCandidates?: number | undefined;
        minScore?: number | undefined;
        logoPath?: string | undefined;
        faviconPath?: string | undefined;
        logoLimit?: number | undefined;
        faviconLimit?: number | undefined;
    }>;
    readonly cliOptions: CLIOptionDefinition[];
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    parseCLIOptions(options: Record<string, any>, stepIndex: number): LogoScraperRawConfigV2 | null;
    resolveConfig(rawConfig: LogoScraperRawConfigV2, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<LogoScraperResolvedConfigV2>;
    execute(config: LogoScraperResolvedConfigV2, context: PluginExecutionContext): Promise<PluginResult>;
}
//# sourceMappingURL=LogoScraperPluginV2.d.ts.map