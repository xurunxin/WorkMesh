import type { Locale, OperationsCopy } from '../lib/i18n';

export type OperationsRun = {
  id: string;
  rule_id: string | null;
  loop_id: string | null;
  session_id: string | null;
  dry_run: boolean;
  status:
    | 'pending'
    | 'claimed'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'dead'
    | 'canceled'
    | 'dry_run';
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  last_error: string | null;
};

type RunDisplay = {
  id: string;
  kind: string;
  state: string;
  attempts: string;
  session: string;
  created: string;
  error: string | null;
  values: readonly string[];
};

export function runDisplayValues(
  run: OperationsRun,
  locale: Locale,
  copy: OperationsCopy,
): RunDisplay {
  const id = run.id.slice(0, 8);
  const kind = run.dry_run
    ? copy.runKindDryRun
    : run.loop_id
      ? copy.runKindLoop
      : copy.runKindRule;
  const state = copy.runState(run.status);
  const attempts = `${run.attempt_count} / ${run.max_attempts}`;
  const session = run.session_id?.slice(0, 8) ?? '—';
  const created = Number.isNaN(Date.parse(run.created_at))
    ? copy.notScheduled
    : new Date(run.created_at).toLocaleString(locale);
  const error = run.last_error;

  return {
    id,
    kind,
    state,
    attempts,
    session,
    created,
    error,
    values: [id, kind, state, attempts, session, created, ...(error ? [error] : [])],
  };
}

type RunsTableProps = {
  runs: OperationsRun[];
  locale: Locale;
  copy: OperationsCopy;
};

export function RunsTable({ runs, locale, copy }: RunsTableProps) {
  return (
    <div
      aria-label={copy.runs}
      className="operations-table-scroll"
      data-testid="operations-table-scroll"
      role="region"
      tabIndex={0}
    >
      <table className="operations-runs-table">
        <caption className="wm-visually-hidden">{copy.runs}</caption>
        <colgroup>
          <col className="operations-run-column-id" />
          <col className="operations-run-column-kind" />
          <col className="operations-run-column-status" />
          <col className="operations-run-column-attempts" />
          <col className="operations-run-column-session" />
          <col className="operations-run-column-created" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{copy.run}</th>
            <th scope="col">{copy.kind}</th>
            <th scope="col">{copy.status}</th>
            <th scope="col">{copy.attempts}</th>
            <th scope="col">{copy.session}</th>
            <th scope="col">{copy.created}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const display = runDisplayValues(run, locale, copy);
            const errorId = `run-error-${run.id}`;

            return (
              <RunRows
                copy={copy}
                display={display}
                errorId={errorId}
                key={run.id}
                run={run}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type RunRowsProps = {
  run: OperationsRun;
  display: RunDisplay;
  errorId: string;
  copy: OperationsCopy;
};

function RunRows({ run, display, errorId, copy }: RunRowsProps) {
  return (
    <>
      <tr
        aria-describedby={display.error ? errorId : undefined}
        data-testid={`run-row-${run.id}`}
      >
        <td>
          <code>{display.id}</code>
        </td>
        <td>{display.kind}</td>
        <td>
          <span className={`status ${run.status}`}>{display.state}</span>
        </td>
        <td>{display.attempts}</td>
        <td>
          {run.session_id ? (
            <a
              aria-label={`${copy.session}: ${run.session_id}`}
              href={`/agent-sessions/${encodeURIComponent(run.session_id)}`}
            >
              <code>{display.session}</code>
            </a>
          ) : (
            '—'
          )}
        </td>
        <td>
          <time dateTime={run.created_at}>{display.created}</time>
        </td>
      </tr>
      {display.error ? (
        <tr className="operations-run-error-row">
          <td colSpan={6}>
            <small className="error" id={errorId}>
              {display.error}
            </small>
          </td>
        </tr>
      ) : null}
    </>
  );
}
