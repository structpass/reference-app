import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ok } from '../../common/dto';
import { ImportsService } from './imports.service';
import { MAX_IMPORT_BYTES, IMPORT_VALIDATION_ERROR_CODE } from './imports.constants';

/** CSV 取込で許可する MIME。多くのブラウザ / OS が text/csv 以外で送るため複数許容。 */
const ALLOWED_CSV_MIME_TYPES: ReadonlySet<string> = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

@ApiTags('imports')
@Controller('imports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Get(':target/template')
  @RequirePermission('file-import', 'view')
  @ApiOperation({ summary: '取込テンプレートCSV（ヘッダー行のみ）をダウンロード' })
  @ApiParam({ name: 'target', description: '取込対象キー（例: products）' })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  getTemplate(
    @Param('target') target: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const { buffer, fileName } = this.service.getTemplate(target);
    // SEC-M6: fileName は target から動的生成されるため RFC 5987 で UTF-8 名も併記する。
    // ASCII フォールバック（filename="..."）+ filename*=UTF-8''<percent-encoded> の二段構え。
    // announcements の添付 DL と同一エンコード方針（非 ASCII 名でもブラウザが正しく扱う）。
    const encoded = encodeURIComponent(fileName).replace(
      /['()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`,
    );
    return new StreamableFile(buffer);
  }

  @Post(':target')
  @RequirePermission('file-import', 'create')
  // SEC-M2: 取込は bulk upsert で 1 リクエストが重い（最大 MAX_IMPORT_ROWS 行を
  // 単一トランザクションで処理）。dryRun(preview)・commit の双方をこの 1 endpoint が
  // 受けるため、global 30 req/60s より厳しく 1 分あたり 5 回に制限し連打を抑える。
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'CSVファイルを取込む（dryRun で検証のみ実行可）' })
  @ApiParam({ name: 'target', description: '取込対象キー（例: products）' })
  @ApiQuery({ name: 'dryRun', required: false, description: '検証のみ（既定 false）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_CSV_MIME_TYPES.has(file.mimetype)) {
          cb(null, true);
          return;
        }
        cb(new BadRequestException(`CSVファイルではありません: ${file.mimetype}`), false);
      },
    }),
  )
  async import(
    @Param('target') target: string,
    @Query('dryRun') dryRun: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('id') userId: string,
  ) {
    const isDryRun = dryRun === 'true';
    const outcome = await this.service.import(target, file, isDryRun, userId);

    if (!outcome.ok) {
      // 検証エラーは controller 境界で 1 度だけ throw する（spec §6.2）。
      // 応答整形（success:false / error.code / details）は AllExceptionsFilter に委ねる。
      throw new BadRequestException({
        code: IMPORT_VALIDATION_ERROR_CODE,
        message: outcome.message,
        ...(outcome.rows && { details: { rows: outcome.rows } }),
      });
    }

    return ok(outcome.result);
  }
}
