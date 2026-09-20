import type { PlannedActivity } from '@intelligrid/contracts';
import type { ExtractedClaim } from '@intelligrid/contracts/reports';
import { vocabulary, inferredStages } from './vocabulary';
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
        ` ${normalize(`${a.externalId} ${a.name} ${a.location}`)} `.includes(
          ` ${normalize(claim.assetTag)} `,
        );
      const tag = explicit || assetMatches;
      let location =
        !!claim.location && ` ${normalize(a.location)} `.includes(` ${normalize(claim.location)} `);
      const aliases: Record<string, string> = {
        'concrete pour': 'concrete',
        'cable tray': 'tray installation',
      };
      const reportedStage = claim.stage ? normalize(claim.stage) : '';
      let stage = !!claim.stage && normalize(a.stage) === (aliases[reportedStage] ?? reportedStage);
      const words = tokens(`${claim.evidenceQuote} ${claim.activityHint ?? ''}`);
      let description =
        [...tokens(a.name)].filter((w) => words.has(w)).length / Math.max(1, tokens(a.name).size);
      if (a.sourceLevel) {
        const path = vocabulary(`${a.location} ${a.hierarchyPath.map((p) => p.name).join(' ')}`);
        const loc = vocabulary(claim.location ?? '');
        const locationWords = loc
          .split(' ')
          .filter((w) => w.length > 2 && !['area', 'near', 'side', 'the'].includes(w));
        location = !!loc && locationWords.every((w) => path.includes(w));
        const stages = inferredStages(
          `${claim.stage ?? ''} ${claim.activityHint ?? ''} ${claim.evidenceQuote}`,
        );
        stage = stages.some((s) => inferredStages(a.name).includes(s));
        const sourceWords = tokens(
          vocabulary(`${claim.evidenceQuote} ${claim.activityHint ?? ''}`),
        );
        const plannedWords = tokens(vocabulary(a.name));
        description =
          [...plannedWords].filter((w) => sourceWords.has(w)).length /
          Math.max(1, plannedWords.size);
      }
      const features = {
        tag: Number(tag),
        location: Number(location),
        stage: Number(stage),
        description,
        discipline: Number(claim.discipline === a.discipline),
        assignment: Number(a.assignedReporterId === context.authorId),
      };
      const score = a.sourceLevel
        ? Math.min(
            1,
            0.35 * Number(explicit) +
              0.25 * features.location +
              0.2 * features.stage +
              0.15 * features.description +
              0.05 * features.discipline,
          )
        : 0.45 * features.tag +
          0.2 * features.location +
          0.15 * features.stage +
          0.1 * features.description +
          0.05 * features.discipline +
          0.05 * features.assignment;
      const flags: string[] = [];
      if (claim.assetTag && !assetMatches) flags.push('Different asset tag');
      if (claim.location && !location) flags.push('Different location');
      if (claim.stage && !stage && (!a.sourceLevel || inferredStages(claim.stage).length))
        flags.push('Different activity stage');
      if (a.sourceLevel && claim.kind === 'FINISH') {
        const plannedStages = inferredStages(a.name),
          reportedStages = inferredStages(claim.evidenceQuote);
        if (
          plannedStages.length > 1 &&
          plannedStages.some((s) => !reportedStages.includes(s)) &&
          !/whole|entire|all.*(?:scope|work)/i.test(claim.evidenceQuote)
        )
          flags.push('Compound planned scope is not fully confirmed');
      }
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
  if (
    activities.some((a) => a.sourceLevel) &&
    /^(the )?(hall|building|shed|pit|site|area)$/i.test((claim.location ?? '').trim()) &&
    !candidates.some((c) => c.explicit)
  )
    flags.push('Work location missing');
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
  if (!['START', 'FINISH', 'ITEM_PROGRESS', 'PERCENT_PROGRESS', 'MILESTONE'].includes(claim.kind))
    flags.push('Not an executable actual-progress event');
  if (
    claim.qualifiers.length &&
    claim.kind === 'FINISH' &&
    claim.observation?.inspectionRelation !== 'separate'
  )
    flags.push('Finish has unresolved qualifications');
  if (claim.kind === 'ITEM_PROGRESS' && (!claim.quantity || claim.quantity.mode === 'item'))
    flags.push('Quantity or individual item needs clarification');
  if (!candidates.length) flags.push('No matching activity');
  if (
    claim.kind === 'PERCENT_PROGRESS' &&
    (!claim.observation?.percent || claim.observation.percent.basis === 'test_result')
  )
    flags.push('Percentage is not confirmed activity progress');
  if (claim.observation?.quantityCoverage === 'component' && claim.kind === 'ITEM_PROGRESS')
    flags.push('Component progress needs reconciliation');
  if (
    claim.location &&
    candidates.length > 1 &&
    candidates[0]!.features.location &&
    candidates[1]!.features.location &&
    Math.abs(candidates[0]!.score - candidates[1]!.score) < 0.03 &&
    !candidates[0]!.explicit
  )
    flags.push('Work location missing');
  return { facts: claim, flags: [...new Set(flags)], candidates };
}
