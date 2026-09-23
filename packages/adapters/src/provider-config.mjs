// Shared by the worker and the deployment preflight. Never return credential values.
const providers = {
  openai: { key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL', defaultModel: 'gpt-5.4-mini-2026-03-17' },
  gemini: { key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL' },
  anthropic: { key: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL' },
  openrouter: { key: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL' },
  // Replays hand-authored extractions for the seeded demo reports. No credential, no network
  // call, and no generation: an unrecorded report fails instead of producing something.
  fixture: { key: null, model: 'FIXTURE_EXTRACTION_SET', defaultModel: 'scripted-demo-v1' },
};
export function providerConfiguration(env, requireCredentials = true) {
  const requested = env.EXTRACTION_PROVIDER?.trim().toLowerCase() || 'openai';
  const provider = requested === 'claude' ? 'anthropic' : requested;
  if (!Object.hasOwn(providers, provider))
    throw new Error('EXTRACTION_PROVIDER must be openai, gemini, anthropic, openrouter or fixture');
  const spec = providers[provider];
  const model = env[spec.model]?.trim() || spec.defaultModel;
  if (!model || model.startsWith('replace-'))
    throw new Error(`Configure ${spec.model} with an available structured-output model`);
  const transcriptionProvider =
    env.TRANSCRIPTION_PROVIDER?.trim().toLowerCase() ||
    (['openai', 'gemini'].includes(provider) ? provider : 'disabled');
  if (!['openai', 'gemini', 'disabled'].includes(transcriptionProvider))
    throw new Error('TRANSCRIPTION_PROVIDER must be openai, gemini or disabled');
  const transcriptionKey =
    transcriptionProvider === 'disabled' ? null : providers[transcriptionProvider].key;
  const transcriptionModel =
    transcriptionProvider === 'disabled'
      ? null
      : transcriptionProvider === 'openai'
        ? env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-mini-transcribe-2025-12-15'
        : env.GEMINI_TRANSCRIPTION_MODEL?.trim() || env.GEMINI_MODEL?.trim();
  if (
    transcriptionProvider !== 'disabled' &&
    (!transcriptionModel || transcriptionModel.startsWith('replace-'))
  )
    throw new Error(
      'Configure the selected transcription model (GEMINI_TRANSCRIPTION_MODEL or OPENAI_TRANSCRIPTION_MODEL)',
    );
  if (requireCredentials) {
    for (const name of new Set([spec.key, transcriptionKey].filter(Boolean))) {
      const value = env[name]?.trim();
      if (!value || value.startsWith('replace-')) throw new Error(`Configure worker-only ${name}`);
    }
  }
  return {
    provider,
    model,
    keyName: spec.key,
    transcriptionProvider,
    transcriptionModel,
    transcriptionKeyName: transcriptionKey,
  };
}
