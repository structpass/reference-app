// React Hook Form 対応の入力 helper。
// page.fill() で onChange / onSubmit が発火しない事象を 3 段階フォールバックで吸収する。

export async function fillFormField(page, selector, value) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout: 5000 });

  // 1st: Playwright 標準 fill (大抵はこれで十分)
  try {
    await locator.fill(String(value));
    if ((await readValue(locator)) === String(value)) return 'fill';
  } catch {
    /* fall through */
  }

  // 2nd: pressSequentially + dispatch input event (React の controlled input 対策)
  try {
    await locator.click();
    await locator.fill('');
    await locator.pressSequentially(String(value), { delay: 10 });
    await locator.dispatchEvent('input');
    await locator.dispatchEvent('change');
    if ((await readValue(locator)) === String(value)) return 'pressSequentially';
  } catch {
    /* fall through */
  }

  // 3rd: native value setter (最終手段、React の internal state を直接書く)
  await locator.evaluate((el, v) => {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
  if ((await readValue(locator)) === String(value)) return 'nativeSetter';

  throw new Error(`fillFormField failed for ${selector}, value=${value}`);
}

async function readValue(locator) {
  return locator.evaluate((el) => el.value ?? '').catch(() => '');
}

// "selector = value" / 'selector = "quoted value"' をパース。
// CSS attribute selector の `=`（例: input[name="title"]）と区別するため、
// 区切りは **両側に最低 1 つの空白がある `=`** とする（つまり ` = ` を要求）。
export function parseFillOperand(operand) {
  const match = operand.match(/^(.+?)\s+=\s+(?:"([^"]*)"|(.+?))\s*$/);
  if (!match) {
    throw new Error(
      `invalid operand: "${operand}" (expected: "selector = value" with spaces around =)`,
    );
  }
  const [, selector, quoted, bare] = match;
  return { selector: selector.trim(), value: quoted ?? bare?.trim() ?? '' };
}
