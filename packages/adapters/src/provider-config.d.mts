export type ProviderConfiguration = {
  provider: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'fixture';
  model: string;
  keyName: string | null;
  transcriptionProvider: 'openai' | 'gemini' | 'disabled';
  transcriptionModel: string | null;
  transcriptionKeyName: string | null;
};
export function providerConfiguration(
  env: Record<string, string | undefined>,
  requireCredentials?: boolean,
): ProviderConfiguration;
