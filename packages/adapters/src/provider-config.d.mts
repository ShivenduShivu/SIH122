export type ProviderConfiguration = {
  provider: 'openai' | 'gemini' | 'anthropic' | 'openrouter';
  model: string;
  keyName: string;
  transcriptionProvider: 'openai' | 'gemini' | 'disabled';
  transcriptionModel: string | null;
  transcriptionKeyName: string | null;
};
export function providerConfiguration(
  env: Record<string, string | undefined>,
  requireCredentials?: boolean,
): ProviderConfiguration;
