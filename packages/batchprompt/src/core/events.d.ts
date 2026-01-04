export interface BatchPromptEvents {
    'run:start': (config: any) => void;
    'run:end': () => void;
    'row:start': (payload: {
        index: number;
        row: any;
    }) => void;
    'row:end': (payload: {
        index: number;
        result: any;
    }) => void;
    'row:error': (payload: {
        index: number;
        error: Error;
    }) => void;
    'step:start': (payload: {
        row: number;
        step: number;
        name?: string;
    }) => void;
    'step:finish': (payload: {
        row: number;
        step: number;
        result: any;
    }) => void;
    'step:progress': (payload: {
        row: number;
        step: number;
        type: 'status' | 'explode' | 'generation' | 'plugin' | 'info' | 'warn' | 'error';
        message: string;
        data?: any;
    }) => void;
    'plugin:event': (payload: {
        row: number;
        step: number;
        plugin: string;
        event: string;
        data: any;
    }) => void;
    'plugin:artifact': (payload: {
        row: number;
        step: number;
        plugin: string;
        type: string;
        filename: string;
        content: string | Buffer;
        tags: string[];
        metadata?: Record<string, any>;
    }) => void;
}
//# sourceMappingURL=events.d.ts.map