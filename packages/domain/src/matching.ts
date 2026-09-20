import type { PlannedActivity } from '@intelligrid/contracts';
import type { ExtractedClaim } from '@intelligrid/contracts/reports';
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const tokens = (s: string) =>
  new Set(
    normalize(s)
      .split(' ')
      .filter((w) => w.length > 2),
  );
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function rankClaim(
  claim: ExtractedClaim,
  activities: PlannedActivity[],
  context: { authorId: string; selectedActivityId: string | null },
) {
  const candidates = activities
    .map((a) => {
      const explicit =
        !!claim.activityHint && compact(claim.activityHint) === compact(a.externalId);
      const assetMatches =
        !!claim.assetTag &&
        ` ${normalize(`${a.name} ${a.location}`)} `.includes(` ${normalize(claim.assetTag)} `);
      const tag = explicit || assetMatches;
      const location =
        !!claim.location && ` ${normalize(a.location)} `.includes(` ${normalize(claim.location)} `);
      const aliases: Record<string, string> = {
        'concrete pour': 'concrete',
        'cable tray': 'tray installation',
        inspection: 'ndt',
      };
      const reportedStage = claim.stage ? normalize(claim.stage) : '';
      const stage =
        !!claim.stage && normalize(a.stage) === (aliases[reportedStage] ?? reportedStage);
      const words = tokens(`${claim.evidenceQuote} ${claim.activityHint ?? ''}`),
        description =
          [...tokens(a.name)].filter((w) => words.has(w)).length / Math.max(1, tokens(a.name).size);
      const features = {
        tag: Number(tag),
        location: Number(location),
        stage: Number(stage),
        description,
        discipline: Number(claim.discipline === a.discipline),
        assignment: Number(a.assignedReporterId === context.authorId),
      };
      const score =
        0.45 * features.tag +
        0.2 * features.location +
        0.15 * features.stage +
        0.1 * features.description +
        0.05 * features.discipline +
        0.05 * features.assignment;
      const flags: string[] = [];
      if (claim.assetTag && !assetMatches) flags.push('Different asset tag');
      if (claim.location && !location) flags.push('Different location');
      if (claim.stage && !stage) flags.push('Different activity stage');
      if (claim.discipline && claim.discipline !== a.discipline) flags.push('Different discipline');
      return {
        activityId: a.id,
        score: Math.round(score * 10000) / 10000,
        features,
        flags,
        contextSelected: a.id === context.selectedActivityId,
        explicit,
      };
    })
    .filter(
      (c) =>
        c.explicit ||
        c.contextSelected ||
        c.features.description > 0 ||
        c.features.tag > 0 ||
        c.features.location > 0,
    )
    .sort(
      (a, b) =>
        Number(b.explicit) - Number(a.explicit) ||
        Number(b.contextSelected) - Number(a.contextSelected) ||
        b.score - a.score,
    )
    .slice(0, 8)
    .map((c, i) => ({ ...c, rank: i + 1 }));
  const flags: string[] = [];
  if (!claim.eventDate) flags.push('Work date missing');
  if (
    !claim.location &&
    !claim.assetTag &&
    !candidates.some((c) => c.explicit || c.contextSelected)
  )
    flags.push('Work location missing');
  if (claim.scope === 'unknown') flags.push('Activity or item scope unclear');
  if (claim.kind === 'FINISH' && (!claim.fullScope || claim.scope !== 'activity'))
    flags.push('Partial scope cannot finish an activity');
  if (!['START', 'FINISH', 'ITEM_PROGRESS'].includes(claim.kind))
    flags.push('Not an executable actual-progress event');
  if (claim.qualifiers.length && claim.kind === 'FINISH')
    flags.push('Finish has unresolved qualifications');
  if (claim.kind === 'ITEM_PROGRESS' && (!claim.quantity || claim.quantity.mode === 'item'))
    flags.push('Quantity or individual item needs clarification');
  if (!candidates.length) flags.push('No matching activity');
  return { facts: claim, flags, candidates };
}
