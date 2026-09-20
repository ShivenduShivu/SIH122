// Reviewed against the supplied operational vocabulary; never learned from a single approval.
export const vocabularyVersion = 'oil-synthetic-v1';
export function vocabulary(text: string) {
  return text
    .toLowerCase()
    .replace(/\brcvg\b|\breceiving hall\b|\btipping hall\b/g, 'receiving tipping hall')
    .replace(/\bproc\.?\s*bldg\b|\bprocessing (?:bldg|building)\b/g, 'processing building')
    .replace(/\bbldg\b/g, 'building')
    .replace(/\bb\/wall\b/g, 'boundary wall')
    .replace(/\bpit \(hopper\)/g, 'tipping pit')
    .replace(/\b(?:lean concrete|blinding)\b/g, 'pcc')
    .replace(/\brebar(?: tying)?\b|\bsteel fixing\b/g, 'reinforcement')
    .replace(/\bformwork\b/g, 'shuttering')
    .replace(/\b(?:excavate|excavated|digging|dug)\b/g, 'excavation')
    .replace(/\b(?:prefabricate|prefabrication|prefab|fabricate)\b/g, 'fabrication')
    .replace(/\b(?:concreting|concrete pour|rmc pour)\b/g, 'concrete')
    .replace(/\b(?:earthing|earth pits?)\b/g, 'earthing')
    .replace(/\b(?:footing|foundation)s?\b/g, 'footing')
    .replace(/\bspools\b/g, 'spool')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export function normalizedUnit(unit: string) {
  const u = unit
    .toLowerCase()
    .replace(/[³²]/g, (c) => (c === '³' ? '3' : '2'))
    .trim();
  return (
    (
      {
        cum: 'm3',
        'cubic metres': 'm3',
        sqm: 'm2',
        rm: 'm',
        'running metres': 'm',
        spools: 'spool',
        joints: 'joint',
        nos: 'count',
        no: 'count',
        mt: 't',
      } as Record<string, string>
    )[u] ?? u
  );
}
export function inferredStages(text: string) {
  const s = vocabulary(text);
  return [
    ['excavation', /excavation/],
    ['pcc', /pcc/],
    ['reinforcement', /reinforcement/],
    ['shuttering', /shuttering/],
    ['concrete', /concrete/],
    ['masonry', /masonry/],
    ['fabrication', /fabrication|fit up|welded/],
    ['erection', /erect|erection/],
    ['earthing', /earthing|gi strip/],
    ['inspection', /inspection|test|check/],
    ['painting', /paint/],
    ['clearing', /clearing|clear.*grub/],
    ['compaction', /compaction/],
    ['subgrade', /subgrade/],
    ['levelling', /levelling|leveling/],
  ]
    .filter(([, regex]) => (regex as RegExp).test(s))
    .map(([name]) => name as string);
}
