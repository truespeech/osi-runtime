import type { SemanticModel } from "./model.js";
import type { SemanticQuery, MetricInfo, DimensionInfo } from "./types.js";
export type { SemanticQuery, GroupByClause, DimensionGroupBy, TimeDimensionGroupBy, WhereClause, OrderByClause, TimeGrain, WhereOperator, MetricInfo, DimensionInfo, QueryResult, } from "./types.js";
export type { SemanticModel } from "./model.js";
/**
 * OSI Runtime — parses an OSI semantic model and generates SQL
 * from semantic queries.
 *
 * Usage:
 * ```
 * const runtime = new OsiRuntime(parsedYamlObject);
 * const sql = runtime.toSQL({ metric: "total_sales", groupBy: [{ dimension: "region" }] });
 * ```
 */
export declare class OsiRuntime {
    private model;
    /**
     * Create a new OsiRuntime from a raw OSI model object.
     * The object should be the result of parsing OSI YAML/JSON —
     * the consumer handles deserialization.
     */
    constructor(rawModel: unknown);
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
