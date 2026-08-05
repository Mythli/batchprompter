import Handlebars from 'handlebars';
import path from 'path';
import { aggressiveSanitize } from './fileUtils.js';

export interface RenderedOutputPath {
    path: string;
    dir: string;
    basename: string;
    extension: string;
}

export function buildOutputTemplateContext(
    context: Record<string, any>,
    fields: Record<string, any> = {}
): Record<string, any> {
    const renderedContext: Record<string, any> = {};

    for (const [key, val] of Object.entries(context)) {
        const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
        renderedContext[key] = aggressiveSanitize(stringVal);
    }

    for (const [key, val] of Object.entries(fields)) {
        renderedContext[key] = String(val ?? '');
    }

    return renderedContext;
}

export function renderOutputTemplate(
    template: string,
    context: Record<string, any>,
    fields: Record<string, any> = {}
): string {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(buildOutputTemplateContext(context, fields));
}

export function renderOutputPath(
    template: string,
    context: Record<string, any>,
    fields: Record<string, any> = {}
): RenderedOutputPath {
    const rendered = renderOutputTemplate(template, context, fields);
    const resolvedPath = path.resolve(rendered);
    const parsed = path.parse(resolvedPath);

    return {
        path: resolvedPath,
        dir: parsed.dir,
        basename: parsed.name,
        extension: parsed.ext
    };
}

export function renderOutputDirectory(
    template: string,
    context: Record<string, any>,
    fields: Record<string, any> = {}
): string {
    return path.resolve(renderOutputTemplate(template, context, fields));
}
