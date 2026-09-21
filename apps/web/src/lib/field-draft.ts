import { LocalFieldDraft } from '@intelligrid/contracts/media';
export const draftPrefix = 'intelligrid:field-draft:v1:';
export function draftKey(user: string, project: string) {
  return `${draftPrefix}${user}:${project}`;
}
export function readDraft(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  user: string,
  project: string,
  now = Date.now(),
) {
  const key = draftKey(user, project),
    raw = storage.getItem(key);
  if (!raw) return null;
  let parsed;
  try {
    parsed = LocalFieldDraft.safeParse(JSON.parse(raw));
  } catch {
    storage.removeItem(key);
    return null;
  }
  if (
    !parsed.success ||
    parsed.data.userId !== user ||
    parsed.data.projectId !== project ||
    now - parsed.data.updatedAt > 7 * 86400000 ||
    parsed.data.updatedAt > now + 60000
  ) {
    storage.removeItem(key);
    return null;
  }
  return parsed.data;
}
export function clearUserDrafts(user: string) {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(`${draftPrefix}${user}:`)) localStorage.removeItem(key);
  }
}
