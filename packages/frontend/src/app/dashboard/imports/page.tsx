'use client';

import { useCallback, useRef, useState } from 'react';
import { Download, FileUp, Play, SearchCheck } from 'lucide-react';
import { PageShell } from '@/components/shared/page-shell';
import { FeatureGuard } from '@/components/shared/feature-guard';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFileDownload } from '@/hooks/use-file-download';
import { useImport, type ImportTargetKey } from '@/features/imports';
import { ImportResultPanel } from '@/features/imports';
import { templateUrl } from '@/features/imports';

/** 取込対象の選択肢。現状は products のみ。将来マスタ追加時はここに足す。 */
const IMPORT_TARGETS: { value: ImportTargetKey; label: string; templateFilename: string }[] = [
  { value: 'products', label: '商品マスタ', templateFilename: '商品マスタ取込テンプレート.csv' },
];

export default function ImportsPage() {
  return (
    <FeatureGuard featureId="file-import" action="view" fallbackPath="/dashboard">
      <ImportsPageBody />
    </FeatureGuard>
  );
}

function ImportsPageBody() {
  const { download } = useFileDownload();
  const { running, feedback, execute, reset } = useImport();

  const [target, setTarget] = useState<ImportTargetKey>('products');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetDef = IMPORT_TARGETS.find((t) => t.value === target) ?? IMPORT_TARGETS[0];

  const handleTargetChange = useCallback(
    (value: string) => {
      setTarget(value as ImportTargetKey);
      setFile(null);
      reset();
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [reset],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFile(e.target.files?.[0] ?? null);
      reset();
    },
    [reset],
  );

  const handleRun = useCallback(
    (dryRun: boolean) => {
      if (!file) return;
      void execute(target, file, dryRun);
    },
    [execute, file, target],
  );

  const handleTemplateDownload = useCallback(() => {
    void download(templateUrl(target), targetDef.templateFilename);
  }, [download, target, targetDef.templateFilename]);

  return (
    <PageShell title="ファイル取込" featureId="file-import">
      <Card>
        <CardContent className="space-y-6 p-6">
          {/* 1. 取込対象セレクタ */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="import-target">
              取込対象
            </label>
            <div className="max-w-xs">
              <Select value={target} onValueChange={handleTargetChange}>
                <SelectTrigger id="import-target" aria-label="取込対象">
                  <SelectValue placeholder="取込対象を選択" />
                </SelectTrigger>
                <SelectContent>
                  {IMPORT_TARGETS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 2. テンプレート CSV ダウンロード */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">テンプレート</span>
            <div>
              <Button variant="sp-action" size="sm" onClick={handleTemplateDownload}>
                <Download className="mr-1 h-4 w-4" />
                テンプレート CSV をダウンロード
              </Button>
              <p className="mt-1 text-xs text-[var(--sp-text-warm-mute)]">
                ヘッダー行のみのテンプレートです。各行に商品の完全な内容を入力してください。
              </p>
            </div>
          </div>

          {/* 3. ファイル選択 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="import-file">
              CSV ファイル
            </label>
            <input
              id="import-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hover:file:bg-[var(--sp-accent-soft)]/80 block w-full max-w-md text-sm text-[var(--sp-text-warm)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--sp-accent-soft)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--sp-accent-ink)]"
            />
            {file && (
              <p className="flex items-center gap-1 text-xs text-[var(--sp-text-warm-mute)]">
                <FileUp className="h-3.5 w-3.5" />
                {file.name}
              </p>
            )}
          </div>

          {/* 4. ボタン 2 つ — 検証のみは閲覧(view)権限の範疇、取込実行は書き込みのため create で gate（SEC-H3） */}
          <div className="flex gap-2">
            <Button
              variant="sp-action"
              onClick={() => handleRun(true)}
              disabled={!file || running}
              loading={running}
            >
              <SearchCheck className="mr-1 h-4 w-4" />
              検証のみ（ドライラン）
            </Button>
            <PermissionGate featureId="file-import" action="create">
              <Button
                variant="sp-action"
                onClick={() => handleRun(false)}
                disabled={!file || running}
                loading={running}
              >
                <Play className="mr-1 h-4 w-4" />
                取込実行
              </Button>
            </PermissionGate>
          </div>

          {/* 5. 結果表示エリア */}
          {feedback && <ImportResultPanel feedback={feedback} />}
        </CardContent>
      </Card>
    </PageShell>
  );
}
