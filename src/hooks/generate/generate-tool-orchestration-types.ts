export type PromptMode = 'positive' | 'negative';

export type GenerateResponse = {
  prompt: string;
  mode: PromptMode;
  provider: 'llm' | 'template';
  model: import('@/lib/comfy-models/client').ComfyImageModel;
  comfyNode: string;
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  metadata?: {
    rawPrompt?: string;
    wardrobeAssignments?: Array<{
      wardrobeId?: string | null;
      footwearId?: string | null;
      accessoriesId?: string | null;
    }>;
  };
};

export const EXAMPLE_INPUTS = [
  'neon alley, rain, black cat',
  'two women, rooftop bar, city lights',
  'gothic cathedral, candles, fog',
  'cyberpunk city at night',
];
