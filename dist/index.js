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
export class OsiRuntime {
    model;
    /**
     * Create a new OsiRuntime from a raw OSI model object.
     * The object should be the result of parsing OSI YAML/JSON —
     * the consumer handles deserialization.
     */
    constructor(rawModel) {
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
