'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';

// React 19: ref コールバックがクリーンアップ関数を返すと、アンマウント時は「その返り値」だけが
// 呼ばれ null 再呼び出しは行われない（return なしの旧仕様のみ null 再呼び出し）。本関数は常に
// クリーンアップを返すため、各 ref を個別に null へ戻す処理をここで肩代わりする必要がある。
function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    const cleanups = refs.map((ref) => {
      if (!ref) return undefined;
      if (typeof ref === 'function') {
        const cleanup = ref(node);
        return typeof cleanup === 'function' ? cleanup : () => ref(null);
      }
      (ref as React.MutableRefObject<T | null>).current = node;
      return () => {
        (ref as React.MutableRefObject<T | null>).current = null;
      };
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup?.());
    };
  };
}

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within Tabs');
  return ctx;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

function Tabs({
  value: controlledValue,
  defaultValue = '',
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) setInternalValue(newValue);
      onValueChange?.(newValue);
    },
    [controlledValue, onValueChange],
  );

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={cn('', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onMouseOver, onMouseLeave, children, ...props }, forwardedRef) => {
    const {
      listRef,
      onMouseOver: onBandMouseOver,
      onMouseLeave: onBandMouseLeave,
      bandStyle,
    } = useRowHoverBand<HTMLDivElement>('[role="tab"]', 'horizontal');
    const setRefs = React.useCallback(mergeRefs(forwardedRef, listRef), [forwardedRef, listRef]);

    return (
      <div
        ref={setRefs}
        role="tablist"
        className={cn(
          'relative inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-[var(--sp-text-warm-mute)]',
          className,
        )}
        onMouseOver={(e) => {
          onBandMouseOver(e);
          onMouseOver?.(e);
        }}
        onMouseLeave={(e) => {
          onBandMouseLeave();
          onMouseLeave?.(e);
        }}
        {...props}
      >
        {bandStyle ? <div aria-hidden="true" className="tabs-hoverband" style={bandStyle} /> : null}
        {children}
      </div>
    );
  },
);
TabsList.displayName = 'TabsList';

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value: triggerValue, ...props }, ref) => {
    const { value, onValueChange } = useTabsContext();
    const isActive = value === triggerValue;

    return (
      <button
        ref={ref}
        role="tab"
        type="button"
        aria-selected={isActive}
        className={cn(
          'relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          isActive
            ? 'bg-background text-[var(--sp-text-warm)] shadow-sm'
            : 'text-[var(--sp-text-warm-mute)] hover:text-[var(--sp-text-warm)]',
          className,
        )}
        onClick={() => onValueChange(triggerValue)}
        {...props}
      />
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value: contentValue, ...props }, ref) => {
    const { value } = useTabsContext();
    if (value !== contentValue) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        className={cn(
          'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
        {...props}
      />
    );
  },
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
