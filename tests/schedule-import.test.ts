import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { parseSchedules, csvColumns, validateArchive } from '@intelligrid/adapters/schedule-import';
import type { ImportFile } from '@intelligrid/contracts/imports';
import { readComplete } from '../apps/worker/src/read-complete';
import ExcelJS from 'exceljs';
const source = (name: string, profile: ImportFile['profile']) => {
  const buffer = readFileSync(`fixtures/schedules/${name}`);
  return {
    file: {
      id: randomUUID(),
      name,
      profile,
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    },
    buffer,
  };
};
const csv = (rows: string[]) => {
  const buffer = Buffer.from([csvColumns.join(','), ...rows].join('\r\n'));
  return {
    file: {
      id: randomUUID(),
      name: 'schedule.csv',
      profile: 'canonical_csv' as const,
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    },
    buffer,
  };
};
const leaf = 'A,,Excavate,task,Y,L6,W1,CIV,2027-11-18,2027-11-24,2200,m3,6,';
describe('provided schedule profile', () => {
  it('flags pre-existing actuals instead of silently dropping them', async () => {
    const s = source('03-GWP_Construction_L4-L6_Schedule.xlsx', 'gwp_construction');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(s.buffer as never);
    book.getWorksheet('L4-L6 Schedule')!.getCell('Q50').value = new Date('2027-11-18T00:00:00Z');
    s.buffer = Buffer.from(await book.xlsx.writeBuffer());
    s.file.bytes = s.buffer.length;
    s.file.sha256 = createHash('sha256').update(s.buffer).digest('hex');
    const r = await parseSchedules([s]);
    expect(r.rows).toHaveLength(226);
    expect(r.errors.some((e) => e.row === 50 && e.message.includes('existing actuals'))).toBe(true);
  }, 30000);
  it('accounts for every source row and consolidates all 11 shared L3 identities', async () => {
    const r = await parseSchedules([
      source('03-GWP_Construction_L4-L6_Schedule.xlsx', 'gwp_construction'),
      source('04-GWP_L3_Schedule.xlsx', 'gwp_l3'),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(318);
    expect(r.nodes).toHaveLength(307);
    expect(r.nodes.filter((n) => n.reportable)).toHaveLength(149);
    expect(r.nodes.filter((n) => n.sourceLevel === 'L3')).toHaveLength(84);
    expect(r.nodes.filter((n) => n.sourceLevel === 'Phase')).toHaveLength(8);
    expect(r.nodes.filter((n) => n.refs.length === 2)).toHaveLength(11);
    const excavation = r.nodes.find((n) => n.externalId === 'GWP-CIV-1250')!;
    expect(excavation.quantity).toBe(2200);
    expect(excavation.unit).toBe('m3');
    expect(excavation.plannedStart).toBe('2027-11-18');
    expect(excavation.hierarchyPath.map((n) => n.id)).toEqual([
      'GWP-PH-7',
      'GWP-L3-030',
      'GWP-CIV-1230',
      'GWP-CIV-1240',
    ]);
    const milestone = r.nodes.find((n) => n.externalId === 'GWP-QAQC-1180')!;
    expect(milestone.kind).toBe('milestone');
    expect(milestone.quantity).toBeNull();
    expect(milestone.unit).toBeNull();
    expect(milestone.duration).toBe(0);
    expect(milestone.plannedFinish).toBe('2028-07-20');
  }, 30000);
  it('supports construction alone, retaining reference parents', async () => {
    const r = await parseSchedules([
      source('03-GWP_Construction_L4-L6_Schedule.xlsx', 'gwp_construction'),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.nodes).toHaveLength(226);
    expect(r.rows).toHaveLength(226);
  }, 30000);
  it('requires reporting leaves for a standalone contextual L3 file', async () => {
    const r = await parseSchedules([source('04-GWP_L3_Schedule.xlsx', 'gwp_l3')]);
    expect(r.errors.some((e) => e.message.includes('No reporting leaves'))).toBe(true);
  });
});
describe('import failure conservation', () => {
  it.each([
    ['missing parent', [leaf.replace('A,,', 'A,missing,')], 'Missing parent'],
    ['duplicate identity', [leaf, leaf], 'duplicate Activity ID'],
    ['cycle', [leaf.replace('A,,', 'A,B,'), leaf.replace('A,,', 'B,A,')], 'cycle'],
    ['reportable parent', [leaf, leaf.replace('A,,', 'B,A,')], 'contain children'],
    ['invalid calendar date', [leaf.replace('2027-11-18', '2027-02-30')], ''],
    ['unknown discipline', [leaf.replace(',CIV,', ',ALIEN,')], 'known discipline'],
    ['missing unit', [leaf.replace(',m3,', ',,')], 'both'],
    ['milestone duration', [leaf.replace(',task,', ',milestone,')], 'Milestone'],
  ])('%s prevents activation without dropping the row', async (_label, rows, message) => {
    const r = await parseSchedules([csv(rows)]);
    expect(r.rows).toHaveLength(rows.length);
    expect(r.errors.length).toBeGreaterThan(0);
    if (message) expect(r.errors.some((e) => e.message.includes(message))).toBe(true);
  });
  it('rejects changed bytes and invalid archives before parsing', async () => {
    const s = csv([leaf]);
    s.file.sha256 = '0'.repeat(64);
    await expect(parseSchedules([s])).rejects.toThrow('checksum');
    await expect(validateArchive(Buffer.from('not zip'))).rejects.toThrow();
  });
  it('retains source fields and null milestone quantity in CSV', async () => {
    const r = await parseSchedules([
      csv(['M,,Handover,milestone,Y,L6,W1,QAQC,2028-07-20,2028-07-20,,,0,']),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.nodes[0]!.refs[0]!.raw['Activity ID']).toBe('M');
    expect(r.nodes[0]!.quantity).toBeNull();
  });
  it('imports more than 200 reportable leaves', async () => {
    const r = await parseSchedules([
      csv(Array.from({ length: 260 }, (_, i) => leaf.replace('A,,', `A${i},,`))),
    ]);
    expect(r.errors).toEqual([]);
    expect(r.nodes).toHaveLength(260);
  });
  it('pages complete catalogues and rejects truncated/changing reads', async () => {
    const rows = Array.from({ length: 460 }, (_, id) => ({ id }));
    expect(
      await readComplete(async (a, b) => ({ data: rows.slice(a, b + 1), error: null, count: 460 })),
    ).toEqual(rows);
    await expect(readComplete(async () => ({ data: [], error: null, count: 460 }))).rejects.toThrow(
      'no partial',
    );
    await expect(
      readComplete(async (a, b) => ({
        data: rows.slice(a, b + 1),
        error: null,
        count: a ? 461 : 460,
      })),
    ).rejects.toThrow('changed');
  });
});
