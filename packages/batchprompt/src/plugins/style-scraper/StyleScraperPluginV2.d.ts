import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { Plugin, PluginExecutionContext, PluginResult, CLIOptionDefinition } from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
export declare const StyleScraperConfigSchemaV2: z.ZodObject<{
    type: z.ZodLiteral<"style-scraper">;
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
    resolution: z.ZodDefault<z.ZodString>;
    mobile: z.ZodDefault<z.ZodBoolean>;
    interactive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "style-scraper";
    output: {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    };
    resolution: string;
    url: string;
    mobile: boolean;
    interactive: boolean;
    id?: string | undefined;
}, {
    type: "style-scraper";
    url: string;
    output?: {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    } | undefined;
    resolution?: string | undefined;
    id?: string | undefined;
    mobile?: boolean | undefined;
    interactive?: boolean | undefined;
}>;
export type StyleScraperRawConfigV2 = z.infer<typeof StyleScraperConfigSchemaV2>;
export interface StyleScraperResolvedConfigV2 {
    type: 'style-scraper';
    id: string;
    output: ResolvedOutputConfig;
    url: string;
    resolution: {
        width: number;
        height: number;
    };
    mobile: boolean;
    interactive: boolean;
}
export declare class StyleScraperPluginV2 implements Plugin<StyleScraperRawConfigV2, StyleScraperResolvedConfigV2> {
    readonly type = "style-scraper";
    readonly configSchema: z.ZodObject<{
        type: z.ZodLiteral<"style-scraper">;
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
        resolution: z.ZodDefault<z.ZodString>;
        mobile: z.ZodDefault<z.ZodBoolean>;
        interactive: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        type: "style-scraper";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        resolution: string;
        url: string;
        mobile: boolean;
        interactive: boolean;
        id?: string | undefined;
    }, {
        type: "style-scraper";
        url: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        resolution?: string | undefined;
        id?: string | undefined;
        mobile?: boolean | undefined;
        interactive?: boolean | undefined;
    }>;
    readonly events: EventEmitter<string | symbol, any>;
    readonly cliOptions: CLIOptionDefinition[];
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    parseCLIOptions(options: Record<string, any>, stepIndex: number): StyleScraperRawConfigV2 | null;
    resolveConfig(rawConfig: StyleScraperRawConfigV2, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<StyleScraperResolvedConfigV2>;
    execute(config: StyleScraperResolvedConfigV2, context: PluginExecutionContext): Promise<PluginResult>;
}
//# sourceMappingURL=StyleScraperPluginV2.d.ts.map