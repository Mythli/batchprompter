import { OutputStrategy, StepExecutionState } from './types.js';
import { PluginPacket } from './plugins/types.js';

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

        // 1. Apply limit/offset to PACKETS when exploding
        let processedPackets = packets;
        if (strategy.explode) {
            if (strategy.offset !== undefined && strategy.offset > 0) {
                processedPackets = processedPackets.slice(strategy.offset);
            }
            if (strategy.limit !== undefined && strategy.limit > 0) {
                processedPackets = processedPackets.slice(0, strategy.limit);
            }
        }

        // 2. Process based on mode
        for (const state of currentStates) {
            if (strategy.explode) {
                // Explode mode: each packet creates one row
                processedPackets.forEach((packet, index) => {
                    const newState = ResultProcessor.cloneState(state);
                    newState.variationIndex = index;

                    // Apply Data to Context (Always)
                    newState.context[namespace] = packet.data;

                    // Apply Content
                    newState.content.push(...packet.contentParts);

                    // Update Row (Conditional)
                    ResultProcessor.updateRow(newState, packet.data, strategy, namespace);

                    nextStates.push(newState);
                });
            } else {
                // Merge mode: all packets merge into one row
                const newState = ResultProcessor.cloneState(state);
                newState.variationIndex = 0;

                // Merge all packet data
                const allData = processedPackets.map(p => p.data);
                const mergedData = allData.length === 1 ? allData[0] : allData;

                // Apply Data to Context (Always)
                newState.context[namespace] = mergedData;

                // Merge all content parts
                for (const packet of processedPackets) {
                    newState.content.push(...packet.contentParts);
                }

                // Update Row (Conditional)
                ResultProcessor.updateRow(newState, mergedData, strategy, namespace);

                nextStates.push(newState);
            }
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
