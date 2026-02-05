
export interface Intent {
    sourceType: string;
    targetType: string;
    action: string;
    constraints: string[];
    originalText: string;
}

export interface MotifCandidate {
    id: string;
    name: string;
    description: string;
    components: string[]; // e.g., ["Valve", "Check Valve"]
    confidence: number;
}

export interface NozzleMapping {
    sourceNozzle: string;
    targetNozzle: string;
    description: string;
}

export interface SpecInfo {
    lineType: string;
    material: string;
    size: string;
    insulation: string;
}

// ── Mock AI Services ──────────────────────────────────────────────

export const mockAI = {
    parseIntent: async (text: string): Promise<Intent> => {
        // Simulate network delay
        await new Promise(r => setTimeout(r, 800));

        const lower = text.toLowerCase();

        // Simple heuristic for the specific demo case
        if (lower.includes('pump') && (lower.includes('heat exchanger') || lower.includes('hex'))) {
            return {
                sourceType: 'Centrifugal Pump',
                targetType: 'Plate Heat Exchanger',
                action: 'connect',
                constraints: ['Process Fluid', 'Min Flow Protection'],
                originalText: text
            };
        }

        // Fallback generic intent
        return {
            sourceType: 'Unknown Equipment',
            targetType: 'Unknown Equipment',
            action: 'connect',
            constraints: [],
            originalText: text
        };
    },

    getMotifCandidates: async (intent: Intent): Promise<MotifCandidate[]> => {
        await new Promise(r => setTimeout(r, 1000));

        if (intent.sourceType.includes('Pump') && intent.targetType.includes('Exchanger')) {
            return [
                {
                    id: 'motif_1',
                    name: 'Direct Discharge',
                    description: 'Simple connection with isolation valve and check valve.',
                    components: ['Check Valve', 'Gate Valve'],
                    confidence: 0.85
                },
                {
                    id: 'motif_2',
                    name: 'Flow Control Loop',
                    description: 'Includes a flow control valve loop for regulated flow.',
                    components: ['Check Valve', 'Gate Valve', 'Flow Control Valve', 'Gate Valve'],
                    confidence: 0.75
                },
                {
                    id: 'motif_3',
                    name: 'Min-Flow Bypass',
                    description: 'Discharge line with a minimum flow recycle line protection.',
                    components: ['Check Valve', 'Gate Valve', 'Min-Flow Valve (Recycle)'],
                    confidence: 0.60
                }
            ];
        }

        return [
            { id: 'm_generic', name: 'Direct Connection', description: 'Generic pipe connection', components: [], confidence: 0.5 }
        ];
    },

    getNozzleMappings: async (motifId: string): Promise<NozzleMapping[]> => {
        await new Promise(r => setTimeout(r, 600));

        // Return a few options for mappings
        return [
            { sourceNozzle: 'N1 (Discharge)', targetNozzle: 'N1 (Inlet)', description: 'Standard Configuration' },
            { sourceNozzle: 'N1 (Discharge)', targetNozzle: 'N2 (Aux Inlet)', description: 'Alternative Routing' }
        ];
    },

    getSpecs: async (nozzleMap: NozzleMapping): Promise<SpecInfo[]> => {
        await new Promise(r => setTimeout(r, 600));

        return [
            { lineType: 'Process Primary', material: 'CS A106 Gr.B', size: '4"', insulation: 'None' },
            { lineType: 'Process Primary', material: 'SS 316L', size: '3"', insulation: 'Mineral Wool' }
        ];
    }
};
