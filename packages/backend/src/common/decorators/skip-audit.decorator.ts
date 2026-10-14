import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/**
 * AuditInterceptor による audit_logs 記録をスキップする。
 * 個人設定（user-table-column-widths 等）のような業務監査対象外の高頻度アクションに付与する。
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
