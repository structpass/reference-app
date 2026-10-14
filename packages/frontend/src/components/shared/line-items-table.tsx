'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';

export interface LineColumn<TLine> {
  key: string;
  label: string;
  width?: string;
  render: (
    line: TLine,
    index: number,
    onChange: (index: number, line: TLine) => void,
  ) => React.ReactNode;
}

interface LineItemsTableProps<TLine> {
  lines: TLine[];
  columns: LineColumn<TLine>[];
  onChange: (lines: TLine[]) => void;
  createEmptyLine: (lineNo: number) => TLine;
  readonly?: boolean;
  summary?: React.ReactNode;
}

export function LineItemsTable<TLine extends { lineNo: number }>({
  lines,
  columns,
  onChange,
  createEmptyLine,
  readonly = false,
  summary,
}: LineItemsTableProps<TLine>) {
  const handleLineChange = (index: number, updated: TLine) => {
    const next = lines.map((l, i) => (i === index ? updated : l));
    onChange(next);
  };

  const addLine = () => {
    const nextNo = lines.length > 0 ? Math.max(...lines.map((l) => l.lineNo)) + 1 : 1;
    onChange([...lines, createEmptyLine(nextNo)]);
  };

  const removeLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index).map((l, i) => ({ ...l, lineNo: i + 1 }));
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--sp-paper-2)]">
            <tr>
              <th className="w-12 px-3 py-2 text-left font-medium text-[var(--sp-text-warm-mute)]">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left font-medium text-[var(--sp-text-warm-mute)]"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
              {!readonly && <th className="w-12 px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (readonly ? 1 : 2)}
                  className="px-3 py-6 text-center text-[var(--sp-text-warm-mute)]"
                >
                  明細行がありません。「行追加」で追加してください。
                </td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr key={line.lineNo} className="border-t border-border">
                  <td className="px-3 py-2 text-[var(--sp-text-warm-mute)]">{line.lineNo}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2">
                      {col.render(line, index, handleLineChange)}
                    </td>
                  ))}
                  {!readonly && (
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(index)}
                        aria-label="行を削除"
                        className="text-[var(--sp-text-warm-mute)] hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
            {summary && <tr className="border-t-2 border-border bg-muted/30">{summary}</tr>}
          </tbody>
        </table>
      </div>

      {!readonly && (
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus className="mr-1 h-4 w-4" />
          行追加
        </Button>
      )}
    </div>
  );
}
