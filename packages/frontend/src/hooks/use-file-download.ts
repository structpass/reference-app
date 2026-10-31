'use client';

import { useCallback } from 'react';
import apiClient from '@/lib/api-client';
import toast from 'react-hot-toast';

/** Blob を <a download> 経由でブラウザに保存させる共通処理。 */
function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export function useFileDownload() {
  const download = useCallback(
    async (url: string, filename: string, params?: Record<string, unknown>) => {
      try {
        const res = await apiClient.get(url, {
          params,
          responseType: 'blob',
        });
        triggerBlobDownload(new Blob([res.data]), filename);
        toast.success('ファイルをダウンロードしました');
      } catch {
        toast.error('ダウンロードに失敗しました');
      }
    },
    [],
  );

  /**
   * クライアント側で生成済みの文字列をファイルとしてダウンロードさせる。
   * サーバー fetch を伴わない（取込エラー CSV のフロント生成等で使用）。
   */
  const downloadText = useCallback((content: string, filename: string, mimeType = 'text/csv') => {
    try {
      triggerBlobDownload(new Blob([content], { type: mimeType }), filename);
      toast.success('ファイルをダウンロードしました');
    } catch {
      toast.error('ダウンロードに失敗しました');
    }
  }, []);

  return { download, downloadText };
}
