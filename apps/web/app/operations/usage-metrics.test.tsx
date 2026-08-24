// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider, useLocale } from '../lib/i18n';
import {
  formatUsageCount,
  UsageMetrics,
  type Usage,
} from './usage-metrics';

const baseUsage: Usage = {
  input_tokens: '1200',
  output_tokens: '300',
  runtime_ms: '90500',
  tool_calls: '42',
  unknown_cost_records: 2,
  currency_buckets: [],
};

function UsageMetricsHarness({ usage }: { usage: unknown }) {
  const { locale, operationsCopy } = useLocale();
  return <UsageMetrics copy={operationsCopy} locale={locale} usage={usage} />;
}

async function renderEnglish(usage: unknown) {
  document.cookie = 'workmesh_locale=en; Path=/';
  const view = render(
    <LocaleProvider>
      <UsageMetricsHarness usage={usage} />
    </LocaleProvider>,
  );
  await waitFor(() => expect(screen.queryByText('Usage data unavailable')).not.toBeNull());
  return view;
}

async function renderEnglishValid(usage: Usage) {
  document.cookie = 'workmesh_locale=en; Path=/';
  const view = render(
    <LocaleProvider>
      <UsageMetricsHarness usage={usage} />
    </LocaleProvider>,
  );
  await screen.findByRole('list', { name: 'Usage and cost' });
  return view;
}

afterEach(() => {
  cleanup();
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0';
  window.localStorage.removeItem('workmesh_locale');
});

describe('UsageMetrics', () => {
  it.each([null, undefined])('fails a %s root payload closed as unavailable', async usage => {
    const { container } = await renderEnglish(usage);
    expect(screen.getByText('Usage data unavailable')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Usage and cost' })).toBeNull();
    expect(container.textContent).not.toContain('0s');
  });

  it('formats aggregate totals and rounded duration without inventing a chart or temporal claim', async () => {
    const { container } = await renderEnglishValid(baseUsage);

    expect(screen.getByText('1,500')).toBeVisible();
    expect(screen.getByText('1m 31s')).toBeVisible();
    expect(screen.getByText('42')).toBeVisible();
    expect(screen.getByText('Unknown cost')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('Never treated as zero.')).toBeVisible();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toMatch(/trend|over time|time[- ]?series|timeline/i);
  });

  it('keeps decimal strings canonical and formats values beyond MAX_SAFE_INTEGER without precision loss', () => {
    expect(formatUsageCount('0', 'en')).toBe('0');
    expect(formatUsageCount('9007199254740993', 'en')).toBe('9,007,199,254,740,993');
    for (const value of ['', '-1', '+1', '01', '1.2', '1e3', ' 1', '1 '])
      expect(formatUsageCount(value, 'en')).toBeNull();
  });

  it.each([
    ['0', '0s'],
    ['499', '0s'],
    ['500', '1s'],
    ['90500', '1m 31s'],
    ['3660500', '1h 1m 1s'],
  ])('rounds runtime %sms half up as %s', async (runtime, expected) => {
    await renderEnglishValid({ ...baseUsage, runtime_ms: runtime, unknown_cost_records: 0 });
    expect(screen.getByText(expected)).toBeVisible();
  });

  it('formats supported minor-unit currencies exactly and keeps unsupported and case-distinct buckets raw', async () => {
    await renderEnglishValid({
      ...baseUsage,
      input_tokens: '9007199254740993',
      unknown_cost_records: 6,
      currency_buckets: [
        { currency: 'USD', known_cost_minor: '9007199254740993', unknown_cost_records: 1 },
        { currency: 'JPY', known_cost_minor: '1234', unknown_cost_records: 0 },
        { currency: 'KWD', known_cost_minor: '1234', unknown_cost_records: 2 },
        { currency: 'ZZZ', known_cost_minor: '12345678901234567890', unknown_cost_records: 3 },
        { currency: 'usd', known_cost_minor: '5', unknown_cost_records: 0 },
      ],
    });

    expect(within(screen.getByRole('listitem', { name: 'USD' })).getByText('$90,071,992,547,409.93')).toBeVisible();
    expect(within(screen.getByRole('listitem', { name: 'JPY' })).getByText('¥1,234')).toBeVisible();
    expect(within(screen.getByRole('listitem', { name: 'KWD' })).getByText(/KWD\s*1\.234/)).toBeVisible();

    const unsupported = screen.getByRole('listitem', { name: 'ZZZ' });
    expect(within(unsupported).getByText('12,345,678,901,234,567,890')).toBeVisible();
    expect(within(unsupported).getByText('ZZZ minor units')).toBeVisible();

    const caseDistinct = screen.getByRole('listitem', { name: 'usd' });
    expect(within(caseDistinct).getByText('5')).toBeVisible();
    expect(within(caseDistinct).getByText('usd minor units')).toBeVisible();
    expect(screen.getAllByTestId('usage-currency-bucket')).toHaveLength(5);
  });

  it('shows global and per-bucket unknown-only aggregates without presenting unknown cost as zero', async () => {
    const emptyBuckets = await renderEnglishValid({
      ...baseUsage,
      unknown_cost_records: 3,
      currency_buckets: [],
    });
    expect(screen.getByText('No known cost')).toBeVisible();
    expect(screen.getByText('Never treated as zero.')).toBeVisible();
    emptyBuckets.unmount();

    await renderEnglishValid({
      ...baseUsage,
      unknown_cost_records: 3,
      currency_buckets: [
        { currency: 'USD', known_cost_minor: '0', unknown_cost_records: 3 },
      ],
    });
    const bucket = screen.getByRole('listitem', { name: 'USD' });
    expect(within(bucket).getByText('$0.00')).toBeVisible();
    expect(within(bucket).getByText('3')).toBeVisible();
    expect(within(bucket).getByText('Never treated as zero.')).toBeVisible();
    expect(within(bucket).queryByText(/total cost/i)).toBeNull();
  });

  it('accepts safe numeric unknown counts and immediately preserves their integer value', async () => {
    await renderEnglishValid({
      ...baseUsage,
      unknown_cost_records: Number.MAX_SAFE_INTEGER,
      currency_buckets: [],
    });
    expect(screen.getByText('9,007,199,254,740,991')).toBeVisible();
  });

  it.each([
    { ...baseUsage, input_tokens: '' },
    { ...baseUsage, output_tokens: '-1' },
    { ...baseUsage, runtime_ms: '01' },
    { ...baseUsage, tool_calls: '1.2' },
    { ...baseUsage, unknown_cost_records: -1 },
    { ...baseUsage, unknown_cost_records: Number.MAX_SAFE_INTEGER + 1 },
    { ...baseUsage, unknown_cost_records: 1.5 },
    { ...baseUsage, currency_buckets: [{ currency: 'USD', known_cost_minor: '1e3', unknown_cost_records: 0 }] },
    { ...baseUsage, currency_buckets: [{ currency: 'USD', known_cost_minor: '0', unknown_cost_records: Number.NaN }] },
    { ...baseUsage, currency_buckets: [{ currency: 'US', known_cost_minor: '0', unknown_cost_records: 0 }] },
    { ...baseUsage, currency_buckets: [null] } as unknown as Usage,
  ])('fails the whole invalid aggregate closed as unavailable', async usage => {
    const { container } = await renderEnglish(usage);
    expect(screen.getByText('Usage data unavailable')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Usage and cost' })).toBeNull();
    expect(container.textContent).not.toContain('0s');
  });

  it('does not use lossy decimal-string coercion in the component source', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/operations/usage-metrics.tsx'), 'utf8');
    expect(source).not.toMatch(/\bNumber\s*\(/);
    expect(source).not.toMatch(/\bparseInt\s*\(/);
    expect(source).not.toMatch(/\bparseFloat\s*\(/);
  });
});
