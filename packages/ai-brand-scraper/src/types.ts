import type OpenAI from 'openai';
import type { z } from 'zod';

export type AiBrandMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface AiBrandPromptTextOptions {
    messages: AiBrandMessage[];
}

export interface AiBrandLlm {
    promptZod<TSchema extends z.ZodTypeAny>(
        messages: AiBrandMessage[],
        schema: TSchema
    ): Promise<z.infer<TSchema>>;
    promptText(options: AiBrandPromptTextOptions): Promise<string>;
}

export type AiBrandFetcher = (
    url: string | URL | Request,
    options?: RequestInit & { ttl?: number }
) => Promise<Response>;

export interface Resolution {
    width: number;
    height: number;
}

export interface ScreenshotData {
    resolution: Resolution;
    screenshotBase64: string;
}

export interface Stylesheet {
    url: string;
    content: string;
}

export interface PageNavigationOptions {
    dismissCookies?: boolean;
    htmlOnly?: boolean;
    resolution?: Resolution;
}

export interface PageActionRequest<TPage extends AiBrandPageLike, TResult> {
    url: string;
    cacheKey?: string;
    ttl?: number;
    navigation?: PageNavigationOptions;
    beforeNavigate?: (page: TPage) => Promise<void>;
    action: (page: TPage) => Promise<TResult>;
}

export interface PageActionExecutor<TPage extends AiBrandPageLike = AiBrandPageLike> {
    executeOnPage<TResult>(request: PageActionRequest<TPage, TResult>): Promise<TResult>;
}

export interface CdpSessionLike {
    send(method: string, params?: Record<string, unknown>): Promise<any>;
    on(event: string, handler: (payload: any) => void): void;
    detach(): Promise<void>;
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface WebsiteStyleElementLike {
    $$(selector: string): Promise<WebsiteStyleElementLike[]>;
    boundingBox(): Promise<BoundingBox | null>;
    isIntersectingViewport(): Promise<boolean>;
    evaluate<T = any>(
        pageFunction: (element: any, ...args: any[]) => T | Promise<T>,
        ...args: any[]
    ): Promise<Awaited<T>>;
    hover(): Promise<void>;
    dispose(): Promise<void>;
}

export interface AiBrandPageLike {
    mouse: {
        move(x: number, y: number): Promise<void>;
    };
    createCDPSession(): Promise<CdpSessionLike>;
    content(): Promise<string>;
    evaluate<T = any>(
        pageFunction: string | ((...args: any[]) => T | Promise<T>),
        ...args: any[]
    ): Promise<Awaited<T>>;
    title(): Promise<string>;
    url(): string;
    setViewport(viewport: Resolution): Promise<void>;
    $(selector: string): Promise<WebsiteStyleElementLike | null>;
    $$(selector: string): Promise<WebsiteStyleElementLike[]>;
    viewport(): Resolution | null;
    screenshot(options: {
        encoding?: 'base64';
        clip?: BoundingBox;
        fullPage?: boolean;
        type?: 'png' | 'jpeg' | 'webp';
        quality?: number;
    }): Promise<string | Uint8Array>;
}

export type WebsiteStylePageLike = AiBrandPageLike;
export type BrandAssetPageLike = AiBrandPageLike;
