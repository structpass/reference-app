import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@/components/ui/checkbox';

describe('Checkbox', () => {
  it('チェックなし状態で描画されること', () => {
    render(<Checkbox checked={false} onChange={vi.fn()} />);
    const input = screen.getByRole('checkbox');
    expect(input).not.toBeChecked();
  });

  it('チェック状態で描画されること', () => {
    render(<Checkbox checked={true} onChange={vi.fn()} />);
    const input = screen.getByRole('checkbox');
    expect(input).toBeChecked();
  });

  it('クリックでonCheckedChangeが呼ばれること', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('onChangeも呼ばれること', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalled();
  });
});
