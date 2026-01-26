export type AIProviderType = 'mock' | 'openai' | 'groq';

export interface AIConfig {
  provider: AIProviderType;
  openai?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  groq?: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  mock?: {
    responseDelayMs: number;
    simulateTyping: boolean;
  };
}
