// Excel シナリオ I/O wrapper。spec § 3.3 の列定義に従う。
// シナリオは scenarios シートに 1 行 = 1 step、stepNo 昇順で実行する。

import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';

const SCENARIO_SHEET = 'scenarios';
const RESULTS_SHEET = 'results';

const COLUMNS = [
  'scenarioId',
  'scenarioName',
  'patternId',
  'patternName',
  'precondRole',
  'precondData',
  'stepNo',
  'operation',
  'expected',
  'judgeMethod',
  'result',
  'evidence',
  'note',
];

export async function readScenarios(xlsxPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.getWorksheet(SCENARIO_SHEET);
  if (!sheet) {
    throw new Error(`sheet "${SCENARIO_SHEET}" not found in ${xlsxPath}`);
  }

  const headerRow = sheet.getRow(1);
  const headerMap = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const name = String(cell.value ?? '').trim();
    if (name) headerMap.set(name, colNumber);
  });

  const missing = COLUMNS.filter((c) => !headerMap.has(c));
  if (missing.length > 0) {
    throw new Error(`missing columns: ${missing.join(', ')}`);
  }

  const rows = [];
  for (let rowIdx = 2; rowIdx <= sheet.rowCount; rowIdx++) {
    const row = sheet.getRow(rowIdx);
    const record = { _rowIdx: rowIdx };
    for (const col of COLUMNS) {
      const cell = row.getCell(headerMap.get(col));
      record[col] = normalizeCell(cell.value);
    }
    if (!record.scenarioId || !record.patternId) continue;
    rows.push(record);
  }

  return groupByPattern(rows);
}

function normalizeCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return v.text;
  if (typeof v === 'object' && 'result' in v) return v.result;
  return v;
}

function groupByPattern(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.scenarioId}::${row.patternId}`;
    if (!map.has(key)) {
      map.set(key, {
        scenarioId: row.scenarioId,
        scenarioName: row.scenarioName,
        patternId: row.patternId,
        patternName: row.patternName,
        precondRole: row.precondRole,
        precondData: row.precondData,
        steps: [],
      });
    }
    map.get(key).steps.push({
      _rowIdx: row._rowIdx,
      stepNo: Number(row.stepNo),
      operation: row.operation,
      expected: row.expected,
      judgeMethod: (row.judgeMethod || 'dom').toString().toLowerCase(),
      note: row.note,
    });
  }
  for (const pattern of map.values()) {
    pattern.steps.sort((a, b) => a.stepNo - b.stepNo);
  }
  return Array.from(map.values());
}

// results[] は [{ _rowIdx, result, evidence }] の形。result セルに値、evidence セルに成果物パスを書き込む。
export async function writeResults(xlsxPath, results) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.getWorksheet(SCENARIO_SHEET);
  const headerRow = sheet.getRow(1);
  const headerMap = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const name = String(cell.value ?? '').trim();
    if (name) headerMap.set(name, colNumber);
  });

  const resultCol = headerMap.get('result');
  const evidenceCol = headerMap.get('evidence');
  if (!resultCol || !evidenceCol) {
    throw new Error('result/evidence column missing');
  }

  for (const r of results) {
    const row = sheet.getRow(r._rowIdx);
    row.getCell(resultCol).value = r.result;
    row.getCell(evidenceCol).value = r.evidence || '';
    row.commit();
  }

  await ensureResultsSummarySheet(workbook, results);
  await workbook.xlsx.writeFile(xlsxPath);
}

async function ensureResultsSummarySheet(workbook, results) {
  let sheet = workbook.getWorksheet(RESULTS_SHEET);
  if (sheet) {
    workbook.removeWorksheet(sheet.id);
  }
  sheet = workbook.addWorksheet(RESULTS_SHEET);
  sheet.addRow(['timestamp', 'totalSteps', 'OK', 'NG', 'pending', 'skip']);
  const counts = { OK: 0, NG: 0, pending: 0, skip: 0 };
  for (const r of results) {
    counts[r.result] = (counts[r.result] ?? 0) + 1;
  }
  sheet.addRow([
    new Date().toISOString(),
    results.length,
    counts.OK,
    counts.NG,
    counts.pending,
    counts.skip,
  ]);
}

export function isXlsxLocked(xlsxPath) {
  // Windows の Excel が開いている時は ~$ で始まる lock ファイルが同ディレクトリにできる
  return existsSync(join(dirname(xlsxPath), `~$${basename(xlsxPath)}`));
}
