import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/shared/status-badge';

describe('StatusBadge', () => {
  it('既知のステータスを日本語ラベルで表示すること', () => {
    render(<StatusBadge status="ACTIVE" />);
    expect(screen.getByText('有効')).toBeInTheDocument();
  });

  it('DRAFTステータスを表示すること', () => {
    render(<StatusBadge status="DRAFT" />);
    expect(screen.getByText('下書き')).toBeInTheDocument();
  });

  it('未知のステータスをそのまま表示すること', () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument();
  });
});
