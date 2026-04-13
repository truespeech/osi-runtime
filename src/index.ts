import type { SemanticModel } from "./model.js";
import type {
  SemanticQuery,
  TargetDialect,
  MetricInfo,
  DimensionInfo,
  QueryResult,
} from "./types.js";
import { parseModel } from "./parser.js";
import { toSQL } from "./resolver.js";

// Re-export public types
export type {
  SemanticQuery,
  TargetDialect,
  GroupByClause,
  DimensionGroupBy,
  TimeDimensionGroupBy,
  WhereClause,
  OrderByClause,
  TimeGrain,
  WhereOperator,
  MetricInfo,
  DimensionInfo,
  QueryResult,
} from "./types.js";

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
const SUPPORTED_DIALECTS = new Set<TargetDialect>(["ansi"]);

export class OsiRuntime {
  private model: SemanticModel;
  private dialect: TargetDialect;

  /**
   * Create a new OsiRuntime from a raw OSI model object.
   *
   * @param rawModel - The result of parsing OSI YAML/JSON (consumer handles deserialization)
   * @param dialect - Target SQL dialect (default: "ansi"). Currently only "ansi" is supported
   *                  (compatible with DuckDB, PostgreSQL, Snowflake). Passing "bigquery" or
   *                  "mysql" will throw an error until those dialects are implemented.
   */
  constructor(rawModel: unknown, dialect: TargetDialect = "ansi") {
    if (!SUPPORTED_DIALECTS.has(dialect)) {
      throw new Error(
        `SQL dialect "${dialect}" is not yet supported. ` +
        `Supported dialects: ${[...SUPPORTED_DIALECTS].join(", ")}`
      );
    }
    this.dialect = dialect;
    this.model = parseModel(rawModel);
  }

  /**
   * List all metrics defined in the semantic model.
   */
  listMetrics(): MetricInfo[] {
    return this.model.metrics.map((m) => ({
      name: m.name,
      description: m.description,
      aiContext: m.aiContext
        ? {
            instructions: m.aiContext.instructions,
            synonyms: m.aiContext.synonyms,
          }
        : undefined,
    }));
  }

  /**
   * List all dimensions that can be used to query a given metric.
   * Returns dimensions from the dataset(s) the metric references.
   */
  dimensionsForMetric(metricName: string): DimensionInfo[] {
    const metric = this.model.metrics.find((m) => m.name === metricName);
    if (!metric) {
      const available = this.model.metrics.map((m) => m.name).join(", ");
      throw new Error(
        `Unknown metric "${metricName}". Available metrics: ${available}`
      );
    }

    const metricExpr = metric.expression.dialects.find(
      (d) => d.dialect === "ANSI_SQL"
    )?.expression;

    const dimensions: DimensionInfo[] = [];

    for (const dataset of this.model.datasets) {
      // Check if this dataset is referenced by the metric
      const isReferenced =
        metricExpr?.includes(`${dataset.name}.`) ||
        this.model.datasets.length === 1;

      if (!isReferenced) continue;

      for (const field of dataset.fields) {
        if (!field.dimension) continue;

        dimensions.push({
          name: field.name,
          isTime: field.dimension.isTime,
          dataset: dataset.name,
          description: field.description,
          aiContext: field.aiContext
            ? {
                instructions: field.aiContext.instructions,
                synonyms: field.aiContext.synonyms,
              }
            : undefined,
        });
      }
    }

    return dimensions;
  }

  /**
   * Generate SQL for a semantic query.
   * This is the core method — it takes a metric name, optional
   * dimensions, filters, ordering, and limit, and returns a
   * SQL string ready for execution.
   */
  toSQL(query: SemanticQuery): string {
    return toSQL(this.model, query);
  }

  /**
   * Access the parsed semantic model (read-only).
   */
  getModel(): Readonly<SemanticModel> {
    return this.model;
  }
}
