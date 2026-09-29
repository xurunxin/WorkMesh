import type { Locale, OperationsCopy } from '../lib/i18n';
import { StatCard, StatGrid } from '@workmesh/ui';

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
    <StatGrid label={copy.metricsTitle}>
      <MetricCard label={copy.metricsTokens} value={formatBigInt(totalTokens, locale)} />
      <MetricCard label={copy.metricsRuntime} value={formatDuration(validated.runtimeMs, locale, copy)} />
      <MetricCard label={copy.metricsToolCalls} value={formatBigInt(validated.toolCalls, locale)} />
      <StatCard className="wm-stat-card-unknown" label={copy.metricsUnknownCost} note={validated.unknownCostRecords > 0n ? copy.metricsNeverTreatedAsZero : null} rows={[{
        label: copy.metricsUnknownCost,
        value: <><strong>{formatBigInt(validated.unknownCostRecords, locale)}</strong> <span>{copy.metricsRecords}</span></>,
      }]} />
      {validated.currencyBuckets.length === 0 ? (
        <StatCard className="wm-stat-card-cost-empty" label={copy.metricsKnownCost} rows={[{ label: copy.metricsKnownCost, value: copy.metricsNoKnownCost }]} />
      ) : validated.currencyBuckets.map((bucket, index) => {
        const supportedCost = formatSupportedCurrencyMinor(bucket.knownCostMinor, bucket.currency, locale);
        return <StatCard
          caption={bucket.currency}
          className="wm-stat-card-currency"
          key={`${bucket.currency}-${index}`}
          label={bucket.currency}
          note={bucket.unknownCostRecords > 0n ? copy.metricsNeverTreatedAsZero : null}
          rows={[
            { label: supportedCost === null ? copy.metricsMinorUnits(bucket.currency) : copy.metricsKnownCost, value: <strong>{supportedCost ?? formatBigInt(bucket.knownCostMinor, locale)}</strong> },
            { label: copy.metricsUnknownCost, value: <><strong>{formatBigInt(bucket.unknownCostRecords, locale)}</strong> <span>{copy.metricsRecords}</span></> },
          ]}
          testId="usage-currency-bucket"
        />
      })}
    </StatGrid>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <StatCard label={label} rows={[{ label, value: <strong>{value}</strong> }]} />
  );
}
