import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { validateArchive } from './schedule-import';
import { SourceEnvelope, type Observation } from '@nirmaan/contracts/observations';
import { ExtractedClaim } from '@nirmaan/contracts/reports';
import { WorkDate } from '@nirmaan/contracts';
const profiles: Record<string, string[]> = {
  Text_Reports: ['Msg ID', 'Date', 'Time', 'Channel', 'From (role)', 'Message'],
  Civil_DPR: [
    'Rec ID',
    'Date',
    'Area / Location',
    'Work description',
    'Qty today',
    'Unit',
    'Cumulative qty',
    'Manpower / equipment',
    'Remarks',
  ],
  Fabrication_Log: [
    'Rec ID',
    'Date',
    'Item / Mark no.',
    'Description',
    'Qty',
    'Unit',
    'Status',
    'Remarks',
  ],
  Electrical_Log: ['Rec ID', 'Date', 'Location', 'Work description', 'Qty', 'Unit', 'Remarks'],
};
export type FieldRow = {
  key: string;
  status: 'ready' | 'rejected';
  error: string | null;
  envelope: SourceEnvelope | null;
  sourceText: string;
  prepared: ExtractedClaim[] | null;
};
export type FieldPreview = {
  kind: 'field_corpus';
  parserVersion: string;
  rows: FieldRow[];
  errors: { message: string }[];
  nodes: never[];
};
const txt = (v: unknown) => (v == null ? '' : String(v).trim());
function date(v: unknown) {
  if (v == null || v === '') return null;
  return WorkDate.parse(v instanceof Date ? v.toISOString().slice(0, 10) : txt(v));
}
export function itemCoverage(text: string): string[] {
  const m = text.match(/\b([A-Z]+)-?0*(\d+)\s*(?:to|[-–])\s*(?:[A-Z]+-?)?0*(\d+)\b/i);
  if (!m) return [];
  const first = Number(m[2]),
    last = Number(m[3]);
  if (last < first || last - first > 999) return [];
  return Array.from({ length: last - first + 1 }, (_, i) => `${m[1]!.toUpperCase()}-${first + i}`);
}
export async function parseFieldWorkbook(
  buffer: Buffer,
  expectedHash: string,
): Promise<FieldPreview> {
  if (
    buffer.length > 5 * 1024 * 1024 ||
    createHash('sha256').update(buffer).digest('hex') !== expectedHash
  )
    throw new Error('Source checksum or size mismatch.');
  await validateArchive(buffer);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as never);
  const result: FieldPreview = {
    kind: 'field_corpus',
    parserVersion: 'field-input-v2',
    rows: [],
    errors: [],
    nodes: [],
  };
  for (const [name, headers] of Object.entries(profiles)) {
    const sheet = book.getWorksheet(name);
    if (!sheet) {
      result.errors.push({ message: `Missing sheet ${name}` });
      continue;
    }
    if (sheet.rowCount > 501 || sheet.columnCount > 30)
      throw new Error('Field profile exceeds supported sheet limits.');
    if (headers.some((h, i) => txt(sheet.getCell(1, i + 1).value) !== h)) {
      result.errors.push({ message: `Unexpected headers in ${name}` });
      continue;
    }
    for (let row = 2; row <= sheet.rowCount; row++) {
      const source = sheet.getRow(row);
      if (!source.hasValues) continue;
      const key = `${name}:${row}`;
      let raw: Record<string, unknown> = {};
      let sourceText = '';
      try {
        raw = Object.fromEntries(
          headers.map((h, i) => {
            const v = source.getCell(i + 1).value;
            if (v && typeof v === 'object' && !(v instanceof Date))
              throw new Error('Use values-only field input cells.');
            if (txt(v).length > 8000) throw new Error('Field cell too long.');
            return [h, v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null)];
          }),
        );
        source.eachCell((cell) => {
          if (Number(cell.col) > headers.length) throw new Error('Unexpected populated column.');
        });
        const id = txt(raw[headers[0]!]);
        if (!id) throw new Error('Missing record ID.');
        const day = date(raw.Date),
          isText = name === 'Text_Reports';
        if (!isText && !day) throw new Error('Work date required for this sheet.');
        const time = txt(raw.Time);
        if (isText && time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
          throw new Error('Message time must be HH:mm.');
        sourceText = isText
          ? txt(raw.Message)
          : headers
              .filter((h) => !['Rec ID', 'Date'].includes(h))
              .filter((h) => raw[h] != null)
              .map((h) => `${h}: ${raw[h]}`)
              .join('\n');
        if (!sourceText || sourceText.length > 10000)
          throw new Error('Missing or oversized source text.');
        const envelope = SourceEnvelope.parse({
          sourceRecordId: id,
          sheet: name,
          row,
          sourceMessageAt: isText && day ? `${day}T${time || '00:00'}:00+05:30` : null,
          reportingWorkDate: isText ? null : day,
          reportedByLabel: isText ? txt(raw['From (role)']) : null,
          channel: isText ? txt(raw.Channel) : 'Discipline spreadsheet',
          raw,
          timezone: 'Asia/Kolkata',
          datePolicy: isText
            ? 'Relative words use message date; undated current-day statements may use message date only as an explicit inference. Missing timestamp stays missing.'
            : 'Date column is work date; narrative dates take precedence.',
        });
        let prepared: ExtractedClaim[] | null = null;
        if (!isText) {
          const desc = txt(raw['Work description'] ?? raw.Description),
            remarks = txt(raw.Remarks),
            items = itemCoverage(txt(raw['Item / Mark no.']) || desc);
          const unit = txt(raw.Unit),
            amount = Number(raw['Cumulative qty'] ?? raw.Qty),
            daily = raw['Qty today'];
          if (
            !unit ||
            !Number.isFinite(amount) ||
            amount < 0 ||
            (daily != null && (!Number.isFinite(Number(daily)) || Number(daily) < 0))
          )
            throw new Error('Quantity and unit must be valid; zero is retained.');
          const civil = name === 'Civil_DPR',
            spools = name === 'Fabrication_Log' && /^S-/i.test(txt(raw['Item / Mark no.'])),
            welded = /welded/i.test(desc);
          const steelReceipt = !civil && !spools && /steel|angles|channels/i.test(desc);
          const observation: Observation = {
            version: 2,
            dateBasis: 'work_date',
            dateEvidence: `${name}!B${row}: ${day}`,
            quantityCoverage:
              civil && !/RMC pour/i.test(desc)
                ? 'activity_total'
                : (spools && welded) || steelReceipt
                  ? 'activity_total'
                  : 'component',
            component: civil ? null : desc,
            dailyQuantity: daily == null ? null : { value: Number(daily), unit },
            items: steelReceipt ? [txt(raw['Item / Mark no.'])] : items,
            coverageStart: day,
            coverageEnd: day,
            percent: null,
            inspectionRelation: null,
          };
          const base: ExtractedClaim = {
            kind: 'ITEM_PROGRESS',
            activityHint: null,
            assetTag: null,
            location: txt(raw['Area / Location'] ?? raw.Location) || null,
            stage: null,
            discipline: civil
              ? 'Civil'
              : name === 'Electrical_Log'
                ? 'Electrical'
                : spools
                  ? 'Piping'
                  : 'Structural',
            scope: 'activity',
            fullScope: false,
            eventDate: day,
            dateOrigin: 'source_work_date',
            quantity: {
              value: amount,
              unit,
              mode: civil || (spools && welded) ? 'cumulative' : 'delta',
            },
            evidenceQuote: sourceText,
            qualifiers: [],
            missingFields: [],
            observation,
          };
          // Daily and cumulative cells are one observation with two measurements, never two additions.
          prepared = [base];
          if (/\bstarted\b/i.test(remarks))
            prepared.unshift({ ...base, kind: 'START', quantity: null });
          if (
            /\bCompleted\b/i.test(`${raw.Status ?? ''} ${remarks}`) &&
            observation.quantityCoverage === 'activity_total'
          )
            prepared.push({ ...base, kind: 'FINISH', fullScope: true });
          // Narrative remarks remain verbatim. Test percentages, blockers and incomplete components need review.
          if (/\b60%/.test(remarks))
            base.observation = { ...observation, percent: { value: 60, basis: 'physical' } };
          if (/temporary works/i.test(remarks))
            prepared = [
              {
                ...base,
                kind: 'UNKNOWN',
                scope: 'unknown',
                qualifiers: ['Temporary works; do not infer a permanent activity.'],
              },
            ];
          if (name === 'Fabrication_Log' && /pipes.*received/i.test(desc))
            prepared = [
              {
                ...base,
                kind: 'UNKNOWN',
                discipline: 'Piping',
                qualifiers: ['Material receipt does not establish fabrication start.'],
              },
            ];
          if (/rain|seepage/i.test(remarks))
            prepared.push({ ...base, kind: 'BLOCKED', quantity: null, qualifiers: [remarks] });
        }
        result.rows.push({ key, status: 'ready', error: null, envelope, sourceText, prepared });
      } catch (e) {
        result.rows.push({
          key,
          status: 'rejected',
          error: (e as Error).message,
          envelope: null,
          sourceText: sourceText || JSON.stringify(raw),
          prepared: null,
        });
      }
    }
  }
  if (result.rows.length > 500) throw new Error('Field import exceeds 500 records.');
  const counts = new Map<string, number>();
  for (const row of result.rows)
    if (row.envelope)
      counts.set(row.envelope.sourceRecordId, (counts.get(row.envelope.sourceRecordId) ?? 0) + 1);
  for (const row of result.rows)
    if (row.envelope && (counts.get(row.envelope.sourceRecordId) ?? 0) > 1) {
      row.status = 'rejected';
      row.error = 'Duplicate source record ID.';
    }
  return result;
}
