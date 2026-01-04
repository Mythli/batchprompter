import { z } from 'zod';
import { EventEmitter } from 'eventemitter3';
import { Plugin, PluginExecutionContext, PluginResult, CLIOptionDefinition } from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/resolvedTypes.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
export declare const ValidationConfigSchemaV2: z.ZodObject<{
    type: z.ZodLiteral<"validation">;
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
    schema: z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>;
    target: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    schema: Record<string, any>;
    type: "validation";
    output: {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    };
    id?: string | undefined;
    target?: string | undefined;
}, {
    schema: Record<string, any>;
    type: "validation";
    output?: {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    } | undefined;
    id?: string | undefined;
    target?: string | undefined;
}>;
export declare const LooseValidationConfigSchemaV2: z.ZodObject<{
    type: z.ZodLiteral<"validation">;
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
    target: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
} & {
    schema: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>]>;
}, "strip", z.ZodTypeAny, {
    schema: string | Record<string, any>;
    type: "validation";
    output: {
        explode: boolean;
        mode: "merge" | "column" | "ignore";
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
    };
    id?: string | undefined;
    target?: string | undefined;
}, {
    schema: string | Record<string, any>;
    type: "validation";
    output?: {
        offset?: number | undefined;
        column?: string | undefined;
        limit?: number | undefined;
        explode?: boolean | undefined;
        mode?: "merge" | "column" | "ignore" | undefined;
    } | undefined;
    id?: string | undefined;
    target?: string | undefined;
}>;
export type ValidationRawConfigV2 = z.infer<typeof LooseValidationConfigSchemaV2>;
export interface ValidationResolvedConfigV2 {
    type: 'validation';
    id: string;
    output: ResolvedOutputConfig;
    schema: any;
    target?: string;
    schemaSource: string;
}
export declare class ValidationPluginV2 implements Plugin<ValidationRawConfigV2, ValidationResolvedConfigV2> {
    readonly type = "validation";
    readonly configSchema: z.ZodObject<{
        type: z.ZodLiteral<"validation">;
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
        target: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    } & {
        schema: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodAny>, Record<string, any>, Record<string, any>>]>;
    }, "strip", z.ZodTypeAny, {
        schema: string | Record<string, any>;
        type: "validation";
        output: {
            explode: boolean;
            mode: "merge" | "column" | "ignore";
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
        };
        id?: string | undefined;
        target?: string | undefined;
    }, {
        schema: string | Record<string, any>;
        type: "validation";
        output?: {
            offset?: number | undefined;
            column?: string | undefined;
            limit?: number | undefined;
            explode?: boolean | undefined;
            mode?: "merge" | "column" | "ignore" | undefined;
        } | undefined;
        id?: string | undefined;
        target?: string | undefined;
    }>;
    readonly events: EventEmitter<string | symbol, any>;
    private ajv;
    constructor();
    readonly cliOptions: CLIOptionDefinition[];
    getRequiredCapabilities(): (keyof ServiceCapabilities)[];
    parseCLIOptions(options: Record<string, any>, stepIndex: number): ValidationRawConfigV2 | null;
    normalizeConfig(config: ValidationRawConfigV2, contentResolver: ContentResolver): Promise<ValidationRawConfigV2>;
    resolveConfig(rawConfig: ValidationRawConfigV2, row: Record<string, any>, inheritedModel: {
        model: string;
        temperature?: number;
        thinkingLevel?: 'low' | 'medium' | 'high';
    }, contentResolver: ContentResolver): Promise<ValidationResolvedConfigV2>;
    execute(config: ValidationResolvedConfigV2, context: PluginExecutionContext): Promise<PluginResult>;
}
//# sourceMappingURL=ValidationPluginV2.d.ts.map