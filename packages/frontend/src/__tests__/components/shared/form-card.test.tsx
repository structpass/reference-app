import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormCard } from '@/components/shared/form-card';

describe('FormCard', () => {
  it('children を表示すること', () => {
    render(
      <FormCard>
        <p>フォーム本体</p>
      </FormCard>,
    );
    expect(screen.getByText('フォーム本体')).toBeInTheDocument();
  });

  it('sp-line-warm 枠と sp-card 背景を持つこと', () => {
    const { container } = render(
      <FormCard>
        <p>本文</p>
      </FormCard>,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/border-\[var\(--sp-line-warm\)\]/);
    expect(card.className).toMatch(/bg-\[var\(--sp-card\)\]/);
  });

  it('className で追加クラスを当てられること', () => {
    const { container } = render(
      <FormCard className="extra-test-class">
        <p>本文</p>
      </FormCard>,
    );
    expect(container.firstElementChild?.className).toMatch(/extra-test-class/);
  });
});
