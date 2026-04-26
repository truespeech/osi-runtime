import { parseModel } from "./parser.js";
import { toSQL } from "./resolver.js";
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
const SUPPORTED_DIALECTS = new Set(["ansi"]);
export class OsiRuntime {
    model;
    dialect;
    /**
     * Create a new OsiRuntime from a raw OSI model object.
     *
     * @param rawModel - The result of parsing OSI YAML/JSON (consumer handles deserialization)
     * @param dialect - Target SQL dialect (default: "ansi"). Currently only "ansi" is supported
     *                  (compatible with DuckDB, PostgreSQL, Snowflake). Passing "bigquery" or
     *                  "mysql" will throw an error until those dialects are implemented.
     */
    constructor(rawModel, dialect = "ansi") {
        if (!SUPPORTED_DIALECTS.has(dialect)) {
            throw new Error(`SQL dialect "${dialect}" is not yet supported. ` +
                `Supported dialects: ${[...SUPPORTED_DIALECTS].join(", ")}`);
        }
        this.dialect = dialect;
        this.model = parseModel(rawModel);
    }
    /**
     * List all metrics defined in the semantic model.
     */
    listMetrics() {
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
    dimensionsForMetric(metricName) {
        const metric = this.model.metrics.find((m) => m.name === metricName);
        if (!metric) {
            const available = this.model.metrics.map((m) => m.name).join(", ");
            throw new Error(`Unknown metric "${metricName}". Available metrics: ${available}`);
        }
        const metricExpr = metric.expression.dialects.find((d) => d.dialect === "ANSI_SQL")?.expression;
        const dimensions = [];
        for (const dataset of this.model.datasets) {
            // Check if this dataset is referenced by the metric
            const isReferenced = metricExpr?.includes(`${dataset.name}.`) ||
                this.model.datasets.length === 1;
            if (!isReferenced)
                continue;
            for (const field of dataset.fields) {
                if (!field.dimension)
                    continue;
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
     * Look up the primary time dimension for a metric.
     * Returns the DimensionInfo for the field marked is_primary in the
     * metric's home dataset, or null if no primary time is declared.
     * Throws if the metric is not found.
     */
    primaryTimeForMetric(metricName) {
        const metric = this.model.metrics.find((m) => m.name === metricName);
        if (!metric) {
            const available = this.model.metrics.map((m) => m.name).join(", ");
            throw new Error(`Unknown metric "${metricName}". Available metrics: ${available}`);
        }
        const metricExpr = metric.expression.dialects.find((d) => d.dialect === "ANSI_SQL")?.expression;
        const homeDataset = this.model.datasets.find((ds) => metricExpr?.includes(`${ds.name}.`)) ?? (this.model.datasets.length === 1 ? this.model.datasets[0] : undefined);
        if (!homeDataset)
            return null;
        const primaryField = homeDataset.fields.find((f) => f.dimension?.isPrimary);
        if (!primaryField || !primaryField.dimension)
            return null;
        return {
            name: primaryField.name,
            isTime: primaryField.dimension.isTime,
            dataset: homeDataset.name,
            description: primaryField.description,
            aiContext: primaryField.aiContext
                ? {
                    instructions: primaryField.aiContext.instructions,
                    synonyms: primaryField.aiContext.synonyms,
                }
                : undefined,
        };
    }
    /**
     * Generate SQL for a semantic query.
     * This is the core method — it takes a metric name, optional
     * dimensions, filters, ordering, and limit, and returns a
     * SQL string ready for execution.
     */
    toSQL(query) {
        return toSQL(this.model, query);
    }
    /**
     * Access the parsed semantic model (read-only).
     */
    getModel() {
        return this.model;
    }
}
