const defaultFailureLimit = 12;

export function workerFailureLimit(setting: string | undefined): number {
  const parsed = Number(setting ?? defaultFailureLimit);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultFailureLimit;
}
