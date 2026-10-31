import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CsvService } from '../../common/services';
import { MAX_IMPORT_ROWS } from './imports.constants';
import { ImportResultDto, ImportRowError } from './dto/import-result.dto';
import { ImportTarget } from './importers/importer.interface';
import { ProductImporter } from './importers/product.importer';

/**
 * SEC-H1: 既知バイナリ形式のマジックバイト（先頭一致で判定）。
 * MIME 申告値（fileFilter）は偽装可能なため、中身でも非テキストを弾く defense-in-depth。
 * ASCII 印字可能な短い署名（"BM" / "MZ" 等）は正当な CSV 先頭と衝突しうるため採用せず、
 * NUL バイト走査（下記）と非 ASCII 先頭の署名のみで判定する（偽陽性回避）。
 */
const BINARY_MAGIC_SIGNATURES: ReadonlyArray<readonly number[]> = [
  [0x50, 0x4b, 0x03, 0x04], // ZIP / xlsx / docx
  [0x50, 0x4b, 0x05, 0x06], // 空 ZIP
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF（"GIF8"。4 バイト ASCII だが業務 CSV 先頭には出現しない）
  [0x1f, 0x8b], // gzip
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xd0, 0xcf, 0x11, 0xe0], // OLE2 compound（旧 .xls / .doc。先頭非 ASCII で CSV と衝突しない）
];

/** NUL バイト走査の上限（先頭 8KB を見れば実用上十分）。 */
const BINARY_SCAN_LIMIT = 8192;

/**
 * 取込結果の discriminated result。
 * - `ok: true` — 検証成功（commit 完了 or dryRun）。controller は 200 で返す。
 * - `ok: false` — 検証失敗。controller 境界で 1 度だけ BadRequestException を throw する。
 *
 * 検証エラーは値として収集する（try/catch を散らさない — architecture-invariants §4 / spec §6.2）。
 */
export type ImportOutcome =
  | { ok: true; result: ImportResultDto }
  | { ok: false; message: string; rows?: ImportRowError[] };

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  /** 登録済み取込対象。key で照合し未登録は 404。 */
  private readonly registry = new Map<string, ImportTarget>();

  constructor(
    private readonly csv: CsvService,
    productImporter: ProductImporter,
  ) {
    this.register(productImporter);
  }

  private register(target: ImportTarget): void {
    this.registry.set(target.key, target);
  }

  /** `:target` パラメータから ImportTarget を解決。未登録は 404（NOT_FOUND）。 */
  private resolveTarget(targetKey: string): ImportTarget {
    const target = this.registry.get(targetKey);
    if (!target) {
      throw new NotFoundException(`取込対象 '${targetKey}' は存在しません`);
    }
    return target;
  }

  /** テンプレート CSV（ヘッダー行のみ）を生成する。 */
  getTemplate(targetKey: string): { buffer: Buffer; fileName: string } {
    const target = this.resolveTarget(targetKey);
    const buffer = this.csv.generate([...target.templateHeaders], []);
    return { buffer, fileName: `${target.key}-import-template.csv` };
  }

  /**
   * CSV ファイルを取込む。parse → ファイル検証 → 行検証 → (dryRun ? 見込み : commit)。
   * 例外を投げず ImportOutcome を返す（NOT_FOUND を除く — target 不存在は resolveTarget が throw）。
   */
  async import(
    targetKey: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
    userId: string,
  ): Promise<ImportOutcome> {
    const target = this.resolveTarget(targetKey);

    // --- [1] ファイルレベル検証 ---
    if (!file || !file.buffer || file.buffer.length === 0) {
      return { ok: false, message: 'CSVファイルがアップロードされていません' };
    }

    // SEC-H1: MIME 申告値（controller の fileFilter）は偽装可能なため、中身でも非テキストを弾く。
    if (this.looksBinary(file.buffer)) {
      return { ok: false, message: 'CSVファイルではありません（バイナリ形式を検出しました）' };
    }

    const parsed = this.csv.parse(file.buffer.toString('utf-8'));
    if (!parsed.ok) {
      return { ok: false, message: `CSVの解析に失敗しました: ${parsed.error}` };
    }
    if (parsed.rows.length === 0) {
      return { ok: false, message: 'CSVが空です' };
    }

    const [headerRow, ...dataRows] = parsed.rows;
    if (!this.headersMatch(headerRow, target.templateHeaders)) {
      return {
        ok: false,
        message: `ヘッダー行が不正です（期待: ${target.templateHeaders.join(', ')}）`,
      };
    }
    if (dataRows.length === 0) {
      return { ok: false, message: 'データ行がありません' };
    }
    if (dataRows.length > MAX_IMPORT_ROWS) {
      return {
        ok: false,
        message: `データ行数が上限（${MAX_IMPORT_ROWS} 行）を超えています`,
      };
    }

    // --- [2] 行レベル検証（全行） ---
    const { errors, validated } = await target.validate(dataRows);
    if (errors.length > 0) {
      return { ok: false, message: 'CSV取込の検証に失敗しました', rows: errors };
    }

    // --- [3] 判定 ---
    if (dryRun) {
      const counts = await target.dryRunCounts(validated);
      this.logger.log(
        `CSV取込 dryRun: target=${target.key} created=${counts.created} updated=${counts.updated}`,
      );
      return {
        ok: true,
        result: { target: target.key, dryRun: true, ...counts },
      };
    }

    const counts = await target.commit(validated, userId);
    this.logger.log(
      `CSV取込 commit: target=${target.key} created=${counts.created} updated=${counts.updated} by=${userId}`,
    );
    return {
      ok: true,
      result: { target: target.key, dryRun: false, ...counts },
    };
  }

  private headersMatch(actual: string[], expected: readonly string[]): boolean {
    if (actual.length !== expected.length) return false;
    return expected.every((h, i) => actual[i].trim() === h);
  }

  /**
   * SEC-H1: アップロード内容がバイナリ（=非テキスト CSV）かを中身で判定する。
   * - NUL バイト: テキスト CSV には出現しない。多くのバイナリ形式が先頭付近に含む。
   * - マジックバイト: 既知バイナリ署名の先頭一致。
   */
  private looksBinary(buffer: Buffer): boolean {
    const scanLen = Math.min(buffer.length, BINARY_SCAN_LIMIT);
    for (let i = 0; i < scanLen; i++) {
      if (buffer[i] === 0x00) return true;
    }
    return BINARY_MAGIC_SIGNATURES.some(
      (sig) => buffer.length >= sig.length && sig.every((byte, i) => buffer[i] === byte),
    );
  }
}
