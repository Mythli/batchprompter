export interface BatchPromptEvents {
    // Lifecycle
    'run:start': (config: any) => void;
    'run:end': () => void;

    // Row Flow
    'row:start': (payload: { index: number; row: any }) => void;
    'row:end': (payload: { index: number; result: any }) => void;
    'row:error': (payload: { index: number; error: Error }) => void;

    // Step Flow
    'step:start': (payload: { row: number; step: number; name?: string }) => void;
    'step:finish': (payload: { row: number; step: number; result: any }) => void;

    // Artifacts (The main output mechanism)
    'artifact': (payload: {
        row: number;
        step: number;
        type: string; // 'image', 'text', 'json', 'html', 'audio'
        filename: string;
        content: string | Buffer;
        tags: string[]; // ['debug', 'final', 'candidate', etc]
        metadata?: Record<string, any>;
    }) => void;

    // Logging (Replaces console.log)
    'log': (payload: { level: 'debug' | 'info' | 'warn' | 'error'; message: string; meta?: any }) => void;
}
