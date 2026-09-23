const defaultFailureLimit = 12;
const defaultRunLoopLimit = 1;
const maximumRunLoopLimit = 20;

export function workerFailureLimit(setting: string | undefined): number {
  const parsed = Number(setting ?? defaultFailureLimit);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultFailureLimit;
}

export function workerRunLoopLimit(setting: string | undefined): number {
  const parsed = Number(setting ?? defaultRunLoopLimit);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximumRunLoopLimit
    ? parsed
    : defaultRunLoopLimit;
}
