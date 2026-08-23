import type { Locale, OperationsCopy } from '../lib/i18n';

export type Usage = {
  input_tokens: string;
  output_tokens: string;
  runtime_ms: string;
  tool_calls: string;
  unknown_cost_records: number;
  currency_buckets: Array<{
    currency: string;
    known_cost_minor: string;
    unknown_cost_records: number;
  }>;
};

type ValidatedUsage = {
  inputTokens: bigint;
  outputTokens: bigint;
  runtimeMs: bigint;
  toolCalls: bigint;
  unknownCostRecords: bigint;
  currencyBuckets: Array<{
    currency: string;
    knownCostMinor: bigint;
    unknownCostRecords: bigint;
  }>;
};

const canonicalDecimal = /^(0|[1-9][0-9]*)$/;
const fallbackSupportedCurrencies = new Set(['USD', 'JPY', 'KWD']);

type IntlCurrencyRegistry = typeof Intl & {
  supportedValuesOf?: (key: 'currency') => string[];
};

function runtimeSupportedCurrencies(): ReadonlySet<string> {
  const supportedValuesOf = (Intl as IntlCurrencyRegistry).supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    try {
      return new Set(supportedValuesOf('currency'));
    } catch {
      return fallbackSupportedCurrencies;
    }
  }
  return fallbackSupportedCurrencies;
}

const supportedCurrencies = runtimeSupportedCurrencies();

function parseDecimal(value: unknown): bigint | null {
  if (typeof value !== 'string' || !canonicalDecimal.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseUnknownCount(value: unknown): bigint | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  return BigInt(value);
}

function formatBigInt(value: bigint, locale: Locale, minimumIntegerDigits = 1): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumIntegerDigits,
    useGrouping: minimumIntegerDigits === 1,
  }).format(value);
}

export function formatUsageCount(value: string, locale: Locale): string | null {
  const parsed = parseDecimal(value);
  return parsed === null ? null : formatBigInt(parsed, locale);
}

function formatDuration(runtimeMs: bigint, locale: Locale, copy: OperationsCopy): string {
  const roundedSeconds = (runtimeMs + 500n) / 1000n;
  const hours = roundedSeconds / 3600n;
  const minutes = (roundedSeconds % 3600n) / 60n;
  const seconds = roundedSeconds % 60n;
  const parts: string[] = [];
  if (hours > 0n)
    parts.push(`${formatBigInt(hours, locale)}${copy.metricsDurationHourUnit}`);
  if (hours > 0n || minutes > 0n)
    parts.push(`${formatBigInt(minutes, locale)}${copy.metricsDurationMinuteUnit}`);
  parts.push(`${formatBigInt(seconds, locale)}${copy.metricsDurationSecondUnit}`);
  return parts.join(' ');
}

function formatSupportedCurrencyMinor(amount: bigint, currency: string, locale: Locale): string | null {
  if (!/^[A-Z]{3}$/.test(currency) || !supportedCurrencies.has(currency)) return null;
  try {
    const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const options = formatter.resolvedOptions();
    const fractionDigits = options.maximumFractionDigits;
    if (
      typeof fractionDigits !== 'number'
      || !Number.isSafeInteger(fractionDigits)
      || fractionDigits < 0
      || fractionDigits > 20
    )
      return null;

    const divisor = 10n ** BigInt(fractionDigits);
    const major = amount / divisor;
    const remainder = amount % divisor;
    const majorText = formatBigInt(major, locale);
    const parts = formatter.formatToParts(0n);
    const decimal = parts.find(part => part.type === 'decimal')?.value ?? '.';
    const fractionText = fractionDigits > 0
      ? `${decimal}${formatBigInt(remainder, locale, fractionDigits)}`
      : '';
    const numberText = `${majorText}${fractionText}`;
    const numericPartTypes = new Set<Intl.NumberFormatPartTypes>([
      'integer',
      'group',
      'decimal',
      'fraction',
    ]);
    let insertedNumber = false;
    return parts.map(part => {
      if (!numericPartTypes.has(part.type)) return part.value;
      if (insertedNumber) return '';
      insertedNumber = true;
      return numberText;
    }).join('');
  } catch {
    return null;
  }
}

function validateUsage(usage: unknown): ValidatedUsage | null {
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const inputTokens = parseDecimal(record.input_tokens);
  const outputTokens = parseDecimal(record.output_tokens);
  const runtimeMs = parseDecimal(record.runtime_ms);
  const toolCalls = parseDecimal(record.tool_calls);
  const unknownCostRecords = parseUnknownCount(record.unknown_cost_records);
  if (
    inputTokens === null
    || outputTokens === null
    || runtimeMs === null
    || toolCalls === null
    || unknownCostRecords === null
    || !Array.isArray(record.currency_buckets)
  ) return null;

  const currencyBuckets: ValidatedUsage['currencyBuckets'] = [];
  for (const bucket of record.currency_buckets) {
    if (typeof bucket !== 'object' || bucket === null || Array.isArray(bucket)) return null;
    const bucketRecord = bucket as Record<string, unknown>;
    const knownCostMinor = parseDecimal(bucketRecord.known_cost_minor);
    const bucketUnknownCostRecords = parseUnknownCount(bucketRecord.unknown_cost_records);
    if (
      typeof bucketRecord.currency !== 'string'
      || !/^[A-Za-z]{3}$/.test(bucketRecord.currency)
      || knownCostMinor === null
      || bucketUnknownCostRecords === null
    ) return null;
    currencyBuckets.push({
      currency: bucketRecord.currency,
      knownCostMinor,
      unknownCostRecords: bucketUnknownCostRecords,
    });
  }

  return {
    inputTokens,
    outputTokens,
    runtimeMs,
    toolCalls,
    unknownCostRecords,
    currencyBuckets,
  };
}

type UsageMetricsProps = {
  usage: unknown;
  locale: Locale;
  copy: OperationsCopy;
};

export function UsageMetrics({ usage, locale, copy }: UsageMetricsProps) {
  const validated = validateUsage(usage);
  if (!validated)
    return <p className="operations-metrics-unavailable" data-testid="usage-metrics-unavailable">{copy.metricsUnavailable}</p>;

  const totalTokens = validated.inputTokens + validated.outputTokens;
  return (
    <ul aria-label={copy.metricsTitle} className="operations-metrics-grid">
      <MetricCard label={copy.metricsTokens} value={formatBigInt(totalTokens, locale)} />
      <MetricCard label={copy.metricsRuntime} value={formatDuration(validated.runtimeMs, locale, copy)} />
      <MetricCard label={copy.metricsToolCalls} value={formatBigInt(validated.toolCalls, locale)} />
      <li aria-label={copy.metricsUnknownCost} className="operations-metric-card operations-metric-card-unknown">
        <dl>
          <div>
            <dt>{copy.metricsUnknownCost}</dt>
            <dd><strong>{formatBigInt(validated.unknownCostRecords, locale)}</strong> <span>{copy.metricsRecords}</span></dd>
          </div>
        </dl>
        {validated.unknownCostRecords > 0n ? <small>{copy.metricsNeverTreatedAsZero}</small> : null}
      </li>
      {validated.currencyBuckets.length === 0 ? (
        <li aria-label={copy.metricsKnownCost} className="operations-metric-card operations-metric-card-cost-empty">
          <dl><div><dt>{copy.metricsKnownCost}</dt><dd>{copy.metricsNoKnownCost}</dd></div></dl>
        </li>
      ) : validated.currencyBuckets.map((bucket, index) => {
        const supportedCost = formatSupportedCurrencyMinor(bucket.knownCostMinor, bucket.currency, locale);
        return (
          <li
            aria-label={bucket.currency}
            className="operations-metric-card operations-metric-card-currency"
            data-testid="usage-currency-bucket"
            key={`${bucket.currency}-${index}`}
          >
            <h3>{bucket.currency}</h3>
            <dl>
              <div>
                <dt>{supportedCost === null ? copy.metricsMinorUnits(bucket.currency) : copy.metricsKnownCost}</dt>
                <dd><strong>{supportedCost ?? formatBigInt(bucket.knownCostMinor, locale)}</strong></dd>
              </div>
              <div>
                <dt>{copy.metricsUnknownCost}</dt>
                <dd><strong>{formatBigInt(bucket.unknownCostRecords, locale)}</strong> <span>{copy.metricsRecords}</span></dd>
              </div>
            </dl>
            {bucket.unknownCostRecords > 0n ? <small>{copy.metricsNeverTreatedAsZero}</small> : null}
          </li>
        );
      })}
    </ul>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <li aria-label={label} className="operations-metric-card">
      <dl><div><dt>{label}</dt><dd><strong>{value}</strong></dd></div></dl>
    </li>
  );
}
