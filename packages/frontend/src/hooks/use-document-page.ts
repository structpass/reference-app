'use client';

import { useState, useCallback } from 'react';
import apiClient from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-utils';
import toast from 'react-hot-toast';

interface UseDocumentPageOptions {
  basePath: string;
  entityName: string;
}

export function useDocumentPage(options: UseDocumentPageOptions) {
  const { basePath, entityName } = options;
  const [transitioning, setTransitioning] = useState(false);

  const transition = useCallback(
    async (id: string | number, action: string, actionLabel: string): Promise<boolean> => {
      setTransitioning(true);
      try {
        await apiClient.put(`${basePath}/${id}/${action}`);
        toast.success(`${entityName}を${actionLabel}しました`);
        return true;
      } catch (err: unknown) {
        toast.error(extractErrorMessage(err, `${entityName}の${actionLabel}に失敗しました`));
        return false;
      } finally {
        setTransitioning(false);
      }
    },
    [basePath, entityName],
  );

  const confirmDocument = useCallback(
    (id: string | number) => transition(id, 'confirm', '確定'),
    [transition],
  );

  const complete = useCallback(
    (id: string | number) => transition(id, 'complete', '完了'),
    [transition],
  );

  const ship = useCallback(
    (id: string | number) => transition(id, 'ship', '出荷完了'),
    [transition],
  );

  return { confirmDocument, complete, ship, transitioning };
}
