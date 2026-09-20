import { it, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseFieldWorkbook, itemCoverage } from '@intelligrid/adapters/field-import';
import { Extraction, ExtractedClaim } from '@intelligrid/contracts/reports';
import { rankClaim } from '@intelligrid/domain/matching';
import { parseSchedules } from '@intelligrid/adapters/schedule-import';
import { PlannedActivity } from '@intelligrid/contracts';
const buffer = readFileSync('fixtures/field/07-Sample_Field_Inputs.xlsx'),
  hash = createHash('sha256').update(buffer).digest('hex');
describe('supplied field source conservation', () => {
  it('retains all 82 rows, originals and independent timestamp meanings', async () => {
    const p = await parseFieldWorkbook(buffer, hash);
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(82);
    expect(p.rows.every((r) => r.status === 'ready')).toBe(true);
    for (const [sheet, n] of Object.entries({
      Text_Reports: 46,
      Civil_DPR: 25,
      Fabrication_Log: 7,
      Electrical_Log: 4,
    }))
      expect(p.rows.filter((r) => r.envelope?.sheet === sheet)).toHaveLength(n);
    expect(p.rows[0]!.envelope!.sourceMessageAt).toBe('2027-10-04T12:30:00+05:30');
    expect(p.rows[0]!.envelope!.reportingWorkDate).toBeNull();
    for (const id of ['TXT-045', 'TXT-046']) {
      const r = p.rows.find((r) => r.envelope?.sourceRecordId === id)!;
      expect(r.envelope!.sourceMessageAt).toBeNull();
      expect(r.prepared).toBeNull();
    }
    const d = p.rows.find((r) => r.envelope?.sourceRecordId === 'CIV-002')!;
    expect(d.prepared).toHaveLength(1);
    expect(d.prepared![0]!.quantity).toEqual({ value: 750, unit: 'cum', mode: 'cumulative' });
    expect(d.prepared![0]!.observation!.dailyQuantity).toEqual({ value: 400, unit: 'cum' });
    for (const row of p.rows)
      for (const c of row.prepared ?? []) {
        expect(ExtractedClaim.safeParse(c).success).toBe(true);
        expect(row.sourceText.includes(c.evidenceQuote)).toBe(true);
      }
    expect(
      p.rows.find((r) => r.envelope?.sourceRecordId === 'ELE-001')!.prepared![0]!.fullScope,
    ).toBe(false);
    expect(p.rows.find((r) => r.envelope?.sourceRecordId === 'ELE-002')!.prepared![0]!.kind).toBe(
      'UNKNOWN',
    );
  });
  it('normalizes explicit ranges without inventing identities', () => {
    expect(itemCoverage('S-001 to S-040')).toHaveLength(40);
    expect(itemCoverage('E1-E6')).toEqual(['E-1', 'E-2', 'E-3', 'E-4', 'E-5', 'E-6']);
    expect(itemCoverage('12 spools')).toEqual([]);
    expect(itemCoverage('S1-S99999')).toEqual([]);
  });
  it('rejects modified source bytes', async () => {
    await expect(parseFieldWorkbook(buffer, '0'.repeat(64))).rejects.toThrow('checksum');
  });
  it('retains 21 events and explicitly rejects more than the supported bound', async () => {
    const p = await parseFieldWorkbook(buffer, hash),
      c = p.rows.find((r) => r.prepared)?.prepared![0]!;
    expect(Extraction.parse({ claims: Array(21).fill(c) }).claims).toHaveLength(21);
    expect(Extraction.safeParse({ claims: Array(101).fill(c) }).success).toBe(false);
  });
  it('has team-labelled expectations for every original source row before measurement', () => {
    const rows = JSON.parse(readFileSync('fixtures/field/corpus.json', 'utf8'));
    const labels = JSON.parse(readFileSync('fixtures/field/expectations.json', 'utf8'));
    expect(labels.records.map((r: any) => r.recordId).sort()).toEqual(
      rows.map((r: any) => r.id).sort(),
    );
  });
  it('retrieves repeated excavation names using the receiving hall hierarchy', async () => {
    const b = readFileSync('fixtures/schedules/03-GWP_Construction_L4-L6_Schedule.xlsx');
    const imported = await parseSchedules([
      {
        buffer: b,
        file: {
          id: crypto.randomUUID(),
          name: 'construction.xlsx',
          profile: 'gwp_construction',
          bytes: b.length,
          sha256: createHash('sha256').update(b).digest('hex'),
        },
      },
    ]);
    const catalogue = imported.nodes
      .filter((n) => n.reportable)
      .map((n) =>
        PlannedActivity.parse({
          id: crypto.randomUUID(),
          projectId: crypto.randomUUID(),
          revisionId: crypto.randomUUID(),
          externalId: n.externalId,
          name: n.name,
          discipline: n.discipline,
          location: n.location,
          stage: 'unclassified',
          plannedStart: n.plannedStart,
          plannedFinish: n.plannedFinish,
          assignedReporterId: null,
          targetQuantity: n.quantity,
          unit: n.unit,
          nodeKind: n.kind,
          hierarchyPath: n.hierarchyPath,
          sourceLevel: n.sourceLevel,
        }),
      );
    const p = await parseFieldWorkbook(buffer, hash),
      c = p.rows.find((r) => r.envelope?.sourceRecordId === 'CIV-002')!.prepared![0]!;
    const ranked = rankClaim(c, catalogue, {
      authorId: crypto.randomUUID(),
      selectedActivityId: null,
    });
    expect(catalogue.find((a) => a.id === ranked.candidates[0]?.activityId)!.externalId).toBe(
      'GWP-CIV-1250',
    );
    expect(
      rankClaim({ ...c, location: 'Hall', activityHint: 'Hall footing excavation' }, catalogue, {
        authorId: crypto.randomUUID(),
        selectedActivityId: null,
      }).flags,
    ).toContain('Work location missing');
  });
});
