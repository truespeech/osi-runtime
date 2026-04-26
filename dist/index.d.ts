import type { SemanticModel } from "./model.js";
import type { SemanticQuery, TargetDialect, MetricInfo, DimensionInfo } from "./types.js";
export type { SemanticQuery, TargetDialect, GroupByClause, DimensionGroupBy, TimeDimensionGroupBy, WhereClause, OrderByClause, TimeGrain, WhereOperator, MetricInfo, DimensionInfo, QueryResult, } from "./types.js";
export type { SemanticModel } from "./model.js";
export declare class OsiRuntime {
    private model;
    private dialect;
    /**
     * Create a new OsiRuntime from a raw OSI model object.
     *
     * @param rawModel - The result of parsing OSI YAML/JSON (consumer handles deserialization)
     * @param dialect - Target SQL dialect (default: "ansi"). Currently only "ansi" is supported
     *                  (compatible with DuckDB, PostgreSQL, Snowflake). Passing "bigquery" or
     *                  "mysql" will throw an error until those dialects are implemented.
     */
    constructor(rawModel: unknown, dialect?: TargetDialect);
    /**
     * List all metrics defined in the semantic model.
     */
    listMetrics(): MetricInfo[];
    /**
     * List all dimensions that can be used to query a given metric.
     * Returns dimensions from the dataset(s) the metric references.
     */
    dimensionsForMetric(metricName: string): DimensionInfo[];
    /**
     * Look up the primary time dimension for a metric.
     * Returns the DimensionInfo for the field marked is_primary in the
     * metric's home dataset, or null if no primary time is declared.
     * Throws if the metric is not found.
     */
    primaryTimeForMetric(metricName: string): DimensionInfo | null;
    /**
     * Generate SQL for a semantic query.
     * This is the core method — it takes a metric name, optional
     * dimensions, filters, ordering, and limit, and returns a
     * SQL string ready for execution.
     */
    toSQL(query: SemanticQuery): string;
    /**
     * Access the parsed semantic model (read-only).
     */
    getModel(): Readonly<SemanticModel>;
}
