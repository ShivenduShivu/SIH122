import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { fromBuffer } from 'yauzl';
import { createHash } from 'node:crypto';
import {
  ImportNode,
  ParsedImport,
  importVersion,
  MAX_FILE_BYTES,
  MAX_NODES,
  type ImportFile,
} from '@nirmaan/contracts/imports';
import { WorkDate } from '@nirmaan/contracts';

const disciplines: Record<string, string> = {
  CIV: 'Civil',
  PIP: 'Piping',
  ELE: 'Electrical',
  GEN: 'General',
  HSE: 'HSE',
  QAQC: 'Quality',
  STR: 'Structural',
  MEC: 'Mechanical',
  INS: 'Instrumentation',
};
export const csvColumns = [
  'Activity ID',
  'Parent ID',
  'Name',
  'Kind',
  'Reportable',
  'Level',
  'WBS',
  'Discipline',
  'Planned Start',
  'Planned Finish',
  'Quantity',
  'Unit',
  'Duration',
  'Predecessors',
];
const calendar = 'Mon–Sat; Sunday off; no holidays' as const;
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// Validate actual decompressed bytes before ExcelJS opens the archive. No extraction to disk.
export async function validateArchive(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(new Error('Not a valid unencrypted XLSX archive.'));
      let bytes = 0,
        entries = 0,
        settled = false;
      const stop = (e?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        zip.close();
        e ? reject(e) : resolve();
      };
      const timer = setTimeout(() => stop(new Error('Archive inspection timed out.')), 15000);
      zip.on('error', (e) => stop(e));
      zip.on('end', () => stop());
      zip.on('entry', (entry) => {
        if (
          ++entries > 2000 ||
          entry.uncompressedSize > 20 * 1024 * 1024 ||
          /(?:vbaProject|externalLinks|embeddings|activeX)/i.test(entry.fileName) ||
          entry.generalPurposeBitFlag & 1
        )
          return stop(new Error('Unsupported workbook content or archive limit exceeded.'));
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return stop(new Error('Unreadable workbook entry.'));
          stream.on('error', (err) => stop(err));
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 32 * 1024 * 1024) {
              stream.destroy();
              stop(new Error('Workbook expands beyond 32 MB.'));
            }
          });
          stream.on('end', () => {
            if (!settled) zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
function value(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v) return v.result ?? null;
    if ('richText' in v) return v.richText.map((x) => x.text).join('');
    if ('text' in v) return v.text;
    throw new Error(`Unsupported/error cell ${cell.address}.`);
  }
  return v;
}
function day(v: unknown, date1904 = false) {
  if (v instanceof Date) return WorkDate.parse(v.toISOString().slice(0, 10));
  if (typeof v === 'number' && Number.isFinite(v))
    return WorkDate.parse(
      new Date(
        Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) +
          Math.floor(v) * 86400000,
      )
        .toISOString()
        .slice(0, 10),
    );
  if (!text(v)) throw new Error('Required date has no cached value; save a values-only export.');
  return WorkDate.parse(text(v));
}
function num(v: unknown, nullable = false): number | null {
  if (nullable && (v == null || v === '')) return null;
  if (v == null || v === '' || !Number.isFinite(Number(v)))
    throw new Error('Required number is missing or invalid.');
  return Number(v);
}
function rawRow(row: ExcelJS.Row) {
  const raw: Record<string, unknown> = {};
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (Number(cell.col) > 40)
      throw new Error('Schedule profile has unexpected populated columns beyond column AN.');
    if (JSON.stringify(cell.value).length > 8000)
      throw new Error('Cell content exceeds the supported limit.');
    raw[cell.address.replace(/\d+$/, '')] = cell.value;
  });
  return raw;
}
export async function parseSchedules(
  files: Array<{ file: ImportFile; buffer: Buffer }>,
): Promise<ParsedImport> {
  const result: ParsedImport = {
    parserVersion: importVersion,
    nodes: [],
    errors: [],
    rows: [],
    summaries: [],
  };
  const collected: ImportNode[] = [];
  const consume = (
    file: ImportFile,
    sheet: string,
    row: number,
    raw: Record<string, unknown>,
    build: () => unknown,
  ) => {
    try {
      const node = ImportNode.parse(build());
      if (node.plannedFinish < node.plannedStart) throw new Error('Finish precedes start.');
      if ((node.quantity === null) !== (node.unit === null))
        throw new Error('Quantity and unit must both be supplied or both be empty.');
      if (node.reportable && (!node.discipline || !['task', 'milestone'].includes(node.kind)))
        throw new Error('Only a task or milestone with a known discipline can be reportable.');
      if (
        node.kind === 'milestone' &&
        (node.duration !== 0 || node.plannedStart !== node.plannedFinish)
      )
        throw new Error('Milestone needs zero duration and one occurrence date.');
      collected.push(node);
      result.rows.push({
        fileId: file.id,
        sheet,
        row,
        status: 'parsed',
        externalId: node.externalId,
        raw,
      });
    } catch (e) {
      result.errors.push({
        fileId: file.id,
        sheet,
        row,
        message: e instanceof Error ? e.message.slice(0, 400) : 'Invalid row',
      });
      result.rows.push({ fileId: file.id, sheet, row, status: 'error', externalId: null, raw });
    }
  };
  for (const { file, buffer } of files) {
    if (
      buffer.length !== file.bytes ||
      buffer.length > MAX_FILE_BYTES ||
      sha(buffer) !== file.sha256
    )
      throw new Error('File size or checksum differs from the reserved upload.');
    if (file.profile === 'canonical_csv') {
      const rows: unknown[][] = parse(buffer, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 24000,
        relax_column_count: false,
      });
      if (JSON.stringify(rows[0]) !== JSON.stringify(csvColumns))
        throw new Error('Canonical CSV headers must match the documented template exactly.');
      if (rows.length > MAX_NODES + 1) throw new Error('CSV exceeds the 2,500-row limit.');
      rows.slice(1).forEach((r, index) => {
        const row = index + 2,
          raw = Object.fromEntries(csvColumns.map((c, i) => [c, r[i]]));
        consume(file, 'CSV', row, raw, () => {
          const reportable = text(r[4]);
          if (!['Y', 'N'].includes(reportable)) throw new Error('Reportable must be Y or N.');
          const sourceDiscipline = text(r[7]) || null;
          return {
            externalId: text(r[0]),
            parentId: text(r[1]) || null,
            name: text(r[2]),
            kind: text(r[3]),
            reportable: reportable === 'Y',
            sourceLevel: text(r[5]),
            sourceWbs: text(r[6]),
            sourceDiscipline,
            discipline: sourceDiscipline ? (disciplines[sourceDiscipline] ?? null) : null,
            plannedStart: day(r[8]),
            plannedFinish: day(r[9]),
            quantity: num(r[10], true),
            unit: text(r[11]) || null,
            duration: num(r[12]),
            predecessors: text(r[13]),
            calendar,
            refs: [{ fileId: file.id, sheet: 'CSV', row, raw }],
          };
        });
      });
    } else {
      await validateArchive(buffer);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const construction = file.profile === 'gwp_construction',
        sheetName = construction ? 'L4-L6 Schedule' : 'L3 Schedule';
      const sheet = book.getWorksheet(sheetName);
      if (!sheet) throw new Error(`Missing worksheet: ${sheetName}`);
      if (sheet.rowCount > MAX_NODES + 5) throw new Error('Worksheet exceeds the 2,500-row limit.');
      const progressColumns: number[] = [];
      sheet.getRow(5).eachCell((cell, column) => {
        if (/actual|%\s*complete|percent\s*complete/i.test(text(value(cell))))
          progressColumns.push(column);
      });
      if (
        !/Activity ID/i.test(text(value(sheet.getCell('A5')))) ||
        !/WBS/i.test(text(value(sheet.getCell('B5'))))
      )
        throw new Error('Expected Activity ID / WBS headers on row 5.');
      let phase: string | null = null;
      for (let row = 6; row <= sheet.rowCount; row++) {
        const r = sheet.getRow(row);
        if (!r.hasValues) continue;
        const raw = rawRow(r),
          v = (c: number) => value(r.getCell(c));
        if (!construction && text(v(3)) === 'Phase') phase = text(v(1));
        const parentPhase = phase;
        consume(file, sheetName, row, raw, () => {
          if (progressColumns.some((column) => text(v(column))))
            throw new Error(
              'Schedule import cannot apply existing actuals or progress. Preserve this row for reviewed field ingestion.',
            );
          const level = text(v(3));
          let node: Partial<ImportNode>;
          if (construction) {
            if (
              text(v(17)) ||
              text(v(18)) ||
              (text(v(19)) !== '' && Number(v(19)) !== 0) ||
              !['', 'Not Started', ...(level === 'EXT' ? ['-'] : [])].includes(text(v(20)))
            )
              throw new Error(
                'Initial baseline import cannot apply existing actuals or progress. Preserve this row for reviewed progress ingestion.',
              );
            if (!['EXT', 'L4', 'L5', 'L6'].includes(level))
              throw new Error('Unexpected construction level.');
            const sourceDiscipline = text(v(8));
            if (sourceDiscipline !== 'EXT' && !disciplines[sourceDiscipline])
              throw new Error(`Unknown discipline ${sourceDiscipline}.`);
            if (!['Y', 'N'].includes(text(v(16)))) throw new Error('Leaf marker must be Y or N.');
            const kind =
              level === 'EXT'
                ? 'external_dependency'
                : level === 'L4' || level === 'L5'
                  ? 'summary'
                  : text(v(7)) === 'Milestone'
                    ? 'milestone'
                    : 'task';
            node = {
              externalId: text(v(1)),
              parentId: ['', '-'].includes(text(v(5))) ? null : text(v(5)),
              name: text(v(6)),
              kind,
              reportable: text(v(16)) === 'Y',
              sourceLevel: level,
              sourceWbs: text(v(2)),
              sourceDiscipline,
              discipline: (disciplines[sourceDiscipline] as ImportNode['discipline']) ?? null,
              quantity: num(v(10), true),
              unit: text(v(11)) || null,
              duration: num(v(12))!,
              predecessors: text(v(13)),
              plannedStart: day(v(14), book.properties.date1904),
              plannedFinish: day(v(15), book.properties.date1904),
            };
          } else {
            if (!['Phase', 'L3'].includes(level)) throw new Error('Unexpected L3 level.');
            node = {
              externalId: text(v(1)),
              parentId: level === 'Phase' ? null : parentPhase,
              name: text(v(4)),
              kind: 'summary',
              reportable: false,
              sourceLevel: level,
              sourceWbs: text(v(2)),
              sourceDiscipline: null,
              discipline: null,
              quantity: null,
              unit: null,
              duration: num(v(7))!,
              predecessors: text(v(8)),
              plannedStart: day(v(9), book.properties.date1904),
              plannedFinish: day(v(10), book.properties.date1904),
            };
          }
          return { ...node, calendar, refs: [{ fileId: file.id, sheet: sheetName, row, raw }] };
        });
      }
      if (construction) {
        const ref = book.getWorksheet('L3 Reference');
        if (!ref) throw new Error('Missing L3 Reference sheet.');
        for (let row = 5; row <= ref.rowCount; row++) {
          const r = ref.getRow(row);
          if (!text(value(r.getCell(1)))) continue;
          if (!text(value(r.getCell(1))).startsWith('GWP-L3-')) {
            if (row <= 15) throw new Error('Invalid L3 Reference ID.');
            continue;
          }
          const raw = rawRow(r),
            v = (c: number) => value(r.getCell(c));
          consume(file, 'L3 Reference', row, raw, () => ({
            externalId: text(v(1)),
            parentId: null,
            name: text(v(3)),
            kind: 'summary',
            reportable: false,
            sourceLevel: 'L3',
            sourceWbs: text(v(2)),
            sourceDiscipline: null,
            discipline: null,
            quantity: null,
            unit: null,
            duration: num(v(7)),
            predecessors: '',
            plannedStart: day(v(5), book.properties.date1904),
            plannedFinish: day(v(6), book.properties.date1904),
            calendar,
            refs: [{ fileId: file.id, sheet: 'L3 Reference', row, raw }],
          }));
        }
      }
    }
    const records = result.rows.filter((r) => r.fileId === file.id);
    result.summaries.push({
      fileId: file.id,
      profile: file.profile,
      records: records.length,
      parsed: records.filter((r) => r.status === 'parsed').length,
      errors: records.filter((r) => r.status === 'error').length,
    });
  }
  const map = new Map<string, ImportNode>();
  const problem = (n: ImportNode, message: string) => {
    const ref = n.refs[0]!;
    result.errors.push({ fileId: ref.fileId, sheet: ref.sheet, row: ref.row, message });
  };
  for (const n of collected) {
    const prior = map.get(n.externalId);
    if (prior) {
      const sheets = [prior.refs[0]!.sheet, n.refs[0]!.sheet];
      const sharedL3 =
        prior.sourceLevel === 'L3' &&
        n.sourceLevel === 'L3' &&
        sheets.includes('L3 Reference') &&
        sheets.includes('L3 Schedule');
      if (
        !sharedL3 ||
        prior.plannedStart !== n.plannedStart ||
        prior.plannedFinish !== n.plannedFinish ||
        prior.name !== n.name ||
        prior.duration !== n.duration
      ) {
        problem(n, `Conflicting or duplicate Activity ID: ${n.externalId}`);
        continue;
      }
      const merged = n.refs[0]!.sheet === 'L3 Schedule' ? n : prior;
      map.set(n.externalId, { ...merged, refs: [...prior.refs, ...n.refs] });
    } else map.set(n.externalId, n);
  }
  if (map.size > MAX_NODES) throw new Error('Combined schedule exceeds 2,500 nodes.');
  for (const n of map.values()) {
    const seen = new Set([n.externalId]),
      ancestors: ImportNode[] = [];
    let parent = n.parentId;
    while (parent) {
      const p = map.get(parent);
      if (!p) {
        problem(n, `Missing parent: ${parent}`);
        break;
      }
      if (seen.has(parent)) {
        problem(n, 'Hierarchy cycle detected.');
        break;
      }
      seen.add(parent);
      ancestors.unshift(p);
      parent = p.parentId;
    }
    n.hierarchyPath = ancestors.map((x) => ({ id: x.externalId, name: x.name }));
    n.location =
      ancestors.find((x) => x.sourceLevel === 'L4')?.name ?? ancestors.at(-1)?.name ?? n.name;
    n.order = String(collected.indexOf(n)).padStart(5, '0');
    if (n.reportable && [...map.values()].some((x) => x.parentId === n.externalId))
      problem(n, 'A reporting leaf cannot also contain children.');
    const deps = n.predecessors.match(/GWP-[A-Z0-9]+-\d+/g) ?? [];
    for (const dep of deps) if (!map.has(dep)) problem(n, `Missing predecessor: ${dep}`);
  }
  if (![...map.values()].some((n) => n.reportable))
    result.errors.push({
      fileId: files[0]?.file.id ?? '',
      sheet: 'Catalogue',
      row: 0,
      message: 'No reporting leaves. Include the construction workbook or reporting rows.',
    });
  result.nodes = [...map.values()];
  return ParsedImport.parse(result);
}
