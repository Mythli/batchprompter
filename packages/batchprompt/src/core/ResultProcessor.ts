import { OutputStrategy, StepExecutionState } from '../types.js';
import { PluginPacket } from '../plugins/types.js';

export class ResultProcessor {
    /**
     * Applies a result (from a plugin or model) to the current list of StepExecutionStates.
     *
     * 1. Handles flow control (Filter/Enrich/Explode) based on the result packets.
     * 2. Updates `state.context` (always) and `state.content` (append).
     * 3. Conditionally updates `state.row` based on the OutputStrategy.
     */
    static process(
        currentStates: StepExecutionState[],
        packets: PluginPacket[],
        strategy: OutputStrategy,
        namespace: string
    ): StepExecutionState[] {

        const nextStates: StepExecutionState[] = [];

        // If no packets (Filter), we return empty nextStates (Drop).
        if (packets.length === 0) {
            return nextStates;
        }

        for (const state of currentStates) {
            let variationCounter = 0;

            // Iterate over packets (Topology Expansion)
            packets.forEach((packet) => {
                
                // Check for Data Expansion (strategy.explode = true AND data is array)
                if (strategy.explode && Array.isArray(packet.data)) {
                    // Data Explosion
                    let dataArray = packet.data;
                    
                    // Apply limit/offset to the data array
                    if (strategy.offset !== undefined && strategy.offset > 0) {
                        dataArray = dataArray.slice(strategy.offset);
                    }
                    if (strategy.limit !== undefined && strategy.limit > 0) {
                        dataArray = dataArray.slice(0, strategy.limit);
                    }

                    dataArray.forEach((dataItem: any) => {
                        const newState = ResultProcessor.cloneState(state);
                        newState.variationIndex = variationCounter++;
                        
                        // Apply Data to Context (Always)
                        newState.context[namespace] = dataItem;
                        
                        // Apply Content
                        newState.content.push(...packet.contentParts);
                        
                        // Update Row (Conditional)
                        ResultProcessor.updateRow(newState, dataItem, strategy, namespace);
                        
                        nextStates.push(newState);
                    });

                } else {
                    // No Data Explosion (1 Packet -> 1 Row)
                    const newState = ResultProcessor.cloneState(state);
                    newState.variationIndex = variationCounter++;

                    // Apply Data to Context (Always)
                    newState.context[namespace] = packet.data;
                    
                    // Apply Content
                    newState.content.push(...packet.contentParts);
                    
                    // Update Row (Conditional)
                    ResultProcessor.updateRow(newState, packet.data, strategy, namespace);
                    
                    nextStates.push(newState);
                }
            });
        }

        return nextStates;
    }

    private static cloneState(state: StepExecutionState): StepExecutionState {
        return {
            history: state.history, // Immutable, reference copy is fine
            content: [...state.content],
            context: { ...state.context },
            row: { ...state.row },
            originalIndex: state.originalIndex,
            variationIndex: state.variationIndex,
            stepHistory: [...state.stepHistory]
        };
    }

    private static updateRow(state: StepExecutionState, data: any, strategy: OutputStrategy, namespace: string) {
        // Unwrap single-element arrays for both column and merge operations
        let dataToMerge = data;
        if (Array.isArray(data) && data.length === 1) {
            dataToMerge = data[0];
        }

        // Also unwrap if the packet data itself is a single-element array
        if (Array.isArray(dataToMerge) && dataToMerge.length === 1) {
            dataToMerge = dataToMerge[0];
        }

        if (strategy.mode === 'column' && strategy.column) {
            state.row[strategy.column] = dataToMerge;
        } else if (strategy.mode === 'merge') {
            // Special handling for model output: Merge at root if it's an object
            if (namespace === 'modelOutput' && typeof dataToMerge === 'object' && dataToMerge !== null && !Array.isArray(dataToMerge)) {
                Object.assign(state.row, dataToMerge);
            } else {
                // Plugins or primitives: Use namespace to avoid collisions
                state.row[namespace] = dataToMerge;
            }
        }
    }
}
