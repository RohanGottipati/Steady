import "server-only";
import type postgres from "postgres";
import { getDb } from "@/lib/db/client";

type SqlLike = ReturnType<typeof postgres>;

export interface AnalyticsDeps {
  /** Injectable SQL client for tests; defaults to the Tiger singleton. */
  sql?: SqlLike | null;
}

/** Distribution + time-weighted summary of an attempt's path-deviation telemetry. */
export interface DeviationStats {
  /** Median path deviation. */
  p50: number;
  /** 95th-percentile path deviation (tail of the distribution). */
  p95: number;
  /** Worst single-sample path deviation. */
  max: number;
  /** Time-weighted mean path deviation (accounts for uneven sampling). */
  timeWeightedAvg: number;
  sampleCount: number;
}

/**
 * B12 hyperfunction analytics (plan 18.6): p50/p95 of an attempt's path
 * deviation via `percentile_agg`/`approx_percentile`, plus a `time_weight`
 * time-weighted mean so uneven sampling does not skew the average. Reads the
 * raw `metric_samples` telemetry for a single attempt. Returns `null` when
 * Tiger is unconfigured/unreachable or the attempt has no samples; never throws.
 */
export async function getAttemptDeviationStats(
  attemptId: string,
  deps: AnalyticsDeps = {},
): Promise<DeviationStats | null> {
  const sql = deps.sql === undefined ? getDb() : deps.sql;
  if (!sql) return null;
  try {
    const rows = await sql<
      {
        p50: number | null;
        p95: number | null;
        max: number | null;
        time_weighted_avg: number | null;
        sample_count: number;
      }[]
    >`
      select
        approx_percentile(0.5, percentile_agg(path_deviation)) as p50,
        approx_percentile(0.95, percentile_agg(path_deviation)) as p95,
        max(path_deviation) as max,
        average(time_weight('Linear', sampled_at, path_deviation)) as time_weighted_avg,
        count(*)::int as sample_count
      from metric_samples
      where attempt_id = ${attemptId}
    `;
    const row = rows[0];
    if (!row || !row.sample_count || row.p50 == null) return null;
    return {
      p50: Number(row.p50),
      p95: Number(row.p95),
      max: Number(row.max),
      timeWeightedAvg: Number(row.time_weighted_avg),
      sampleCount: row.sample_count,
    };
  } catch {
    return null;
  }
}

/** One point of a downsampled time series. */
export interface SeriesPoint {
  t: string;
  value: number;
}

export interface DownsampleDeps extends AnalyticsDeps {
  /** Target number of points (the chart's pixel budget). */
  points?: number;
}

/**
 * B12 downsampled chart series (plan 18.7): reduce an attempt's path-deviation
 * telemetry to a target number of points with `lttb` (Largest-Triangle-Three-
 * Buckets), which preserves visible peaks and troughs while shrinking the
 * payload. Returns `null` when Tiger is unconfigured/unreachable or on any
 * failure; never throws.
 */
export async function getDownsampledDeviation(
  attemptId: string,
  deps: DownsampleDeps = {},
): Promise<SeriesPoint[] | null> {
  const sql = deps.sql === undefined ? getDb() : deps.sql;
  if (!sql) return null;
  const points = Math.max(2, Math.min(deps.points ?? 100, 1000));
  try {
    const rows = await sql<{ t: string | Date; v: number }[]>`
      select t, v
      from (
        select (lttb(sampled_at, path_deviation, ${points}) -> unnest()).*
        from metric_samples
        where attempt_id = ${attemptId}
      ) as s(t, v)
      order by t
    `;
    return rows.map(r => ({
      t: typeof r.t === "string" ? r.t : new Date(r.t).toISOString(),
      value: Number(r.v),
    }));
  } catch {
    return null;
  }
}
