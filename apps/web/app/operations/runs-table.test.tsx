// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider, useLocale } from '../lib/i18n';
import { runDisplayValues, RunsTable, type OperationsRun } from './runs-table';

const sessionId = '11111111-1111-4111-8111-111111111111';

const failedRun: OperationsRun = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  rule_id: 'rule-1',
  loop_id: null,
  session_id: sessionId,
  dry_run: false,
  status: 'failed',
  attempt_count: 2,
  max_attempts: 3,
  created_at: '2026-08-22T02:30:00.000Z',
  last_error: 'A deliberately long historical failure detail that belongs to this exact run.',
};

function RunsTableHarness({ runs }: { runs: OperationsRun[] }) {
  const { locale, operationsCopy } = useLocale();
  return <RunsTable copy={operationsCopy} locale={locale} runs={runs} />;
}

function DisplayValuesHarness({ run }: { run: OperationsRun }) {
  const { locale, operationsCopy } = useLocale();
  const display = runDisplayValues(run, locale, operationsCopy);

  return <output>{JSON.stringify(display.values)}</output>;
}

describe('RunsTable', () => {
  afterEach(cleanup);

  beforeEach(() => {
    document.cookie = 'workmesh-locale=zh; path=/';
  });

  it('renders a captioned six-column table and associates a historical error detail with its run', () => {
    render(
      <LocaleProvider>
        <RunsTableHarness runs={[failedRun]} />
      </LocaleProvider>,
    );

    const table = screen.getByRole('table', { name: '近期运行' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(6);
    expect(headers.map((header) => header.textContent)).toEqual([
      '运行',
      '类型',
      '状态',
      '尝试次数',
      '会话',
      '创建时间',
    ]);
    expect(headers.every((header) => header.getAttribute('scope') === 'col')).toBe(true);
    expect(table.querySelector('thead')).not.toBeNull();
    expect(table.querySelector('tbody')).not.toBeNull();

    const primaryRow = screen.getByTestId(`run-row-${failedRun.id}`);
    const error = screen.getByText(failedRun.last_error ?? '');
    expect(error.id).toBe(`run-error-${failedRun.id}`);
    expect(primaryRow).toHaveAttribute('aria-describedby', error.id);
    expect(error.closest('td')).toHaveAttribute('colspan', '6');
    expect(error.closest('tr')).not.toBe(primaryRow);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const sessionLink = screen.getByRole('link', { name: `会话: ${sessionId}` });
    expect(sessionLink).toHaveAttribute('href', `/agent-sessions/${encodeURIComponent(sessionId)}`);
    expect(sessionLink).toHaveTextContent(sessionId.slice(0, 8));

    const created = within(primaryRow).getByText(
      new Date(failedRun.created_at).toLocaleString('zh-CN'),
    );
    expect(created.tagName).toBe('TIME');
    expect(created).toHaveAttribute('datetime', failedRun.created_at);
  });

  it('uses an em dash without a link when a run has no session', () => {
    render(
      <LocaleProvider>
        <RunsTableHarness runs={[{ ...failedRun, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', session_id: null }]} />
      </LocaleProvider>,
    );

    const row = screen.getByTestId('run-row-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
  });

  it('exposes the exact rendered strings as the shared filter values', () => {
    render(
      <LocaleProvider>
        <DisplayValuesHarness run={failedRun} />
      </LocaleProvider>,
    );

    expect(JSON.parse(screen.getByText(/^\[/).textContent ?? '[]')).toEqual([
      failedRun.id.slice(0, 8),
      '规则',
      '已失败',
      '2 / 3',
      sessionId.slice(0, 8),
      new Date(failedRun.created_at).toLocaleString('zh-CN'),
      failedRun.last_error,
    ]);
  });

  it('provides a labeled keyboard-focusable local scroll region', () => {
    render(
      <LocaleProvider>
        <RunsTableHarness runs={[failedRun]} />
      </LocaleProvider>,
    );

    expect(screen.getByRole('region', { name: '近期运行' })).toHaveAttribute('tabindex', '0');
  });
});
