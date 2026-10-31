'use client';

import { useCallback } from 'react';
import type { Product, CreateProductDto, UpdateProductDto } from '@struct-pass/shared';
import apiClient from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-utils';
import toast from 'react-hot-toast';

/**
 * 商品の個別取得・作成・更新・削除を行うフック
 * 一覧取得は useListPage を使用すること
 */
export function useProducts() {
  const fetchProduct = useCallback(async (id: string): Promise<Product | null> => {
    try {
      const res = await apiClient.get(`/products/${id}`);
      return res.data.data;
    } catch {
      toast.error('商品の取得に失敗しました');
      return null;
    }
  }, []);

  const createProduct = useCallback(async (data: CreateProductDto): Promise<boolean> => {
    try {
      await apiClient.post('/products', data);
      toast.success('商品を登録しました');
      return true;
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, '商品の登録に失敗しました'));
      return false;
    }
  }, []);

  const updateProduct = useCallback(
    async (id: string, data: UpdateProductDto): Promise<boolean> => {
      try {
        await apiClient.put(`/products/${id}`, data);
        toast.success('更新が完了しました');
        return true;
      } catch (err: unknown) {
        toast.error(extractErrorMessage(err, '商品の更新に失敗しました'));
        return false;
      }
    },
    [],
  );

  const deleteProduct = useCallback(async (id: string): Promise<boolean> => {
    try {
      await apiClient.delete(`/products/${id}`);
      toast.success('商品を削除しました');
      return true;
    } catch {
      toast.error('商品の削除に失敗しました');
      return false;
    }
  }, []);

  return {
    fetchProduct,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}
