'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import React from 'react';
import apiClient from '@/lib/api-client';
import type { PublicConfig } from '@struct-pass/shared';

interface SystemConfigContextValue {
  config: PublicConfig;
  loaded: boolean;
  reload: () => Promise<void>;
}

export const SystemConfigContext = createContext<SystemConfigContextValue>({
  config: {},
  loaded: false,
  reload: async () => {},
});

/** 多セッション伝播用の polling 間隔。env 識別用途では 60s で十分 */
const POLL_INTERVAL_MS = 60_000;

export function useSystemConfigLoader(): SystemConfigContextValue {
  const [config, setConfig] = useState<PublicConfig>({});
  const [loaded, setLoaded] = useState(false);
  const reloadRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    try {
      const res = await apiClient.get('/system-settings/public/config');
      setConfig(res.data.data ?? {});
    } catch {
      // fallback to empty config
    } finally {
      setLoaded(true);
    }
  }, []);

  reloadRef.current = reload;

  useEffect(() => {
    reload();
  }, [reload]);

  // 多セッション伝播: 60s polling + window focus 復帰時に refetch
  useEffect(() => {
    const handleFocus = () => {
      reloadRef.current();
    };
    const intervalId = window.setInterval(() => {
      reloadRef.current();
    }, POLL_INTERVAL_MS);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return { config, loaded, reload };
}

export function SystemConfigProvider({ children }: { children: ReactNode }) {
  const value = useSystemConfigLoader();
  return React.createElement(SystemConfigContext.Provider, { value }, children);
}

export function useSystemConfig() {
  const ctx = useContext(SystemConfigContext);

  const get = (key: string, fallback = ''): string => {
    return ctx.config[key] ?? fallback;
  };

  const getNumber = (key: string, fallback = 0): number => {
    const val = ctx.config[key];
    if (val === undefined) return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  };

  return { ...ctx, get, getNumber };
}
