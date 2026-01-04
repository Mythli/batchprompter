import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { Plugin, PluginExecutionContext, PluginResult, CLIOptionDefinition } from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
export declare const DedupeConfigSchemaV2: z.ZodObject<{
    type: z.ZodLiteral<"dedupe">;
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
    key: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    type: "dedupe";
    output: {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    };
    key: string;
    id?: string | undefined;
}, {
    type: "dedupe";
    key: string;
    output?: {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    } | undefined;
    id?: string | undefined;
}>;
export type DedupeRawConfigV2 = z.infer<typeof DedupeConfigSchemaV2>;
export interface DedupeResolvedConfigV2 {
    type: 'dedupe';
    id: string;
    output: ResolvedOutputConfig;
    keyTemplate: string;
}
export declare class DedupePluginV2 implements Plugin<DedupeRawConfigV2, DedupeResolvedConfigV2> {
    readonly type = "dedupe";
    readonly configSchema: z.ZodObject<{
        type: z.ZodLiteral<"dedupe">;
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
        key: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        type: "dedupe";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        key: string;
        id?: string | undefined;
    }, {
        type: "dedupe";
        key: string;
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
    }>;
    readonly events: EventEmitter<string | symbol, any>;
    readonly cliOptions: CLIOptionDefinition[];
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    parseCLIOptions(options: Record<string, any>, stepIndex: number): DedupeRawConfigV2 | null;
    resolveConfig(rawConfig: DedupeRawConfigV2, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<DedupeResolvedConfigV2>;
    execute(config: DedupeResolvedConfigV2, context: PluginExecutionContext): Promise<PluginResult>;
    static resetState(): void;
}
//# sourceMappingURL=DedupePluginV2.d.ts.map