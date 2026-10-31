'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Product } from '@struct-pass/shared';

interface ExistingProductLine {
  productId: string;
  product?: { id: string; code: string; name: string };
}

export function useProductLineSelection<T extends { productId: string }>(
  setLines: Dispatch<SetStateAction<T[]>>,
  existingLines?: readonly ExistingProductLine[],
) {
  const productNamesRef = useRef<Map<string, string>>(new Map());
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const activeLineIndexRef = useRef<number>(0);

  useEffect(() => {
    if (!existingLines) return;
    for (const line of existingLines) {
      if (line.product && !productNamesRef.current.has(line.productId)) {
        productNamesRef.current.set(line.productId, `${line.product.code} ${line.product.name}`);
      }
    }
  }, [existingLines]);

  const openProductSearch = (index: number) => {
    activeLineIndexRef.current = index;
    setProductSearchOpen(true);
  };

  const handleProductSelect = (product: Product) => {
    const index = activeLineIndexRef.current;
    productNamesRef.current.set(product.id, `${product.code} ${product.name}`);
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, productId: product.id } : line)),
    );
  };

  const getProductDisplay = (productId: string): string => {
    return productNamesRef.current.get(productId) || productId;
  };

  return {
    productSearchOpen,
    setProductSearchOpen,
    openProductSearch,
    handleProductSelect,
    getProductDisplay,
  };
}
