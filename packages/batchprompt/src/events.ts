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
    
    // New Event: Step Resolved
    'step:resolved': (payload: {
        row: number;
        step: number;
        config: any; // Resolved StepConfig
        context: Record<string, any>; // The context used for resolution
    }) => void;

    // Unified Progress Event
    'step:progress': (payload: {
        row: number;
        step: number;
        type: 'status' | 'explode' | 'generation' | 'plugin' | 'info' | 'warn' | 'error';
        message: string;
        data?: any;
    }) => void;

    // New Event: Validation Failed
    'validation:failed': (payload: {
        row: number;
        step: number;
        data: any;
        schema: any;
        errors: any;
    }) => void;

    // The Unified Data Stream for Plugins
    'plugin:event': (payload: {
        row: number;          // Context: Row Index
        step: number;         // Context: Step Index
        plugin: string;       // Source: 'website-agent', 'dedupe', etc.
        event: string;        // Action: 'page:scraped', 'decision:made', 'duplicate:found'
        data: any;            // Payload: The RAW data object
    }) => void;

    // Artifacts (Unified for Core and Plugins)
    'artifact:emit': (payload: {
        row: number;
        step: number;
        source: string; // 'core' or plugin name
        type: string; // 'image', 'text', 'json', 'html', 'audio'
        filename: string;
        content: string | Buffer;
        tags: string[]; // ['debug', 'final', 'candidate', etc]
        metadata?: Record<string, any>;
    }) => void;
}
