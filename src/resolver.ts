import type { SemanticModel, Dataset, Field } from "./model.js";
import type {
  SemanticQuery,
  GroupByClause,
  WhereClause,
  OrderByClause,
  TimeGrain,
} from "./types.js";

const GRAIN_SQL: Record<TimeGrain, string> = {
  day: "day",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year",
};

/**
 * Generate a SQL query from a semantic model and a query specification.
 *
 * The generated SQL uses ANSI SQL dialect with DATE_TRUNC for time
 * grain handling (compatible with DuckDB, Snowflake, Postgres, etc.).
 */
export function toSQL(model: SemanticModel, query: SemanticQuery): string {
  const metric = findMetric(model, query.metric);
  const metricExpr = getAnsiExpression(metric.name, {
    dialects: metric.expression.dialects,
  });
  const dataset = findDatasetForMetric(model, metricExpr);

  const selectParts: string[] = [];
  const groupByParts: string[] = [];

  // Process groupBy clauses
  if (query.groupBy) {
    for (const clause of query.groupBy) {
      const { selectExpr, groupByExpr } = resolveGroupBy(
        dataset,
        clause
      );
      selectParts.push(selectExpr);
      groupByParts.push(groupByExpr);
    }
  }

  // Add the metric as the last SELECT column
  selectParts.push(`${metricExpr} AS ${query.metric}`);

  // Process WHERE clauses
  const whereParts: string[] = [];
  if (query.where) {
    for (const clause of query.where) {
      whereParts.push(resolveWhere(dataset, clause));
    }
  }

  // Build the full query
  let sql = `SELECT ${selectParts.join(", ")}`;
  sql += ` FROM ${dataset.source} AS ${dataset.name}`;

  if (whereParts.length > 0) {
    sql += ` WHERE ${whereParts.join(" AND ")}`;
  }

  if (groupByParts.length > 0) {
    sql += ` GROUP BY ${groupByParts.join(", ")}`;
  }

  // Process ORDER BY
  if (query.orderBy && query.orderBy.length > 0) {
    const orderParts = query.orderBy.map((o) => resolveOrderBy(o));
    sql += ` ORDER BY ${orderParts.join(", ")}`;
  }

  // Process LIMIT
  if (query.limit !== undefined) {
    sql += ` LIMIT ${Math.max(0, Math.floor(query.limit))}`;
  }

  return sql;
}

function findMetric(
  model: SemanticModel,
  name: string
): SemanticModel["metrics"][number] {
  const metric = model.metrics.find((m) => m.name === name);
  if (!metric) {
    const available = model.metrics.map((m) => m.name).join(", ");
    throw new Error(
      `Unknown metric "${name}". Available metrics: ${available}`
    );
  }
  return metric;
}

function getAnsiExpression(
  context: string,
  exprHolder: { dialects: { dialect: string; expression: string }[] }
): string {
  const dialect = exprHolder.dialects.find((d) => d.dialect === "ANSI_SQL");
  if (!dialect) {
    throw new Error(`No ANSI_SQL dialect found for "${context}"`);
  }
  return dialect.expression;
}

function findDatasetForMetric(
  model: SemanticModel,
  metricExpr: string
): Dataset {
  // Extract dataset reference from metric expression.
  // OSI metric expressions reference datasets by name, e.g., SUM(orders.amount)
  for (const dataset of model.datasets) {
    if (metricExpr.includes(`${dataset.name}.`)) {
      return dataset;
    }
  }

  // If no dataset reference found in expression, use the first dataset
  if (model.datasets.length === 1) {
    return model.datasets[0];
  }

  throw new Error(
    `Cannot determine dataset for metric expression "${metricExpr}". ` +
      `Expression must reference a dataset name (e.g., "SUM(datasetname.column)").`
  );
}

function findField(dataset: Dataset, dimensionName: string): Field {
  const field = dataset.fields.find((f) => f.name === dimensionName);
  if (!field) {
    const available = dataset.fields
      .filter((f) => f.dimension)
      .map((f) => f.name)
      .join(", ");
    throw new Error(
      `Unknown dimension "${dimensionName}" in dataset "${dataset.name}". ` +
        `Available dimensions: ${available}`
    );
  }
  if (!field.dimension) {
    throw new Error(
      `Field "${dimensionName}" in dataset "${dataset.name}" is not a dimension`
    );
  }
  return field;
}

function resolveGroupBy(
  dataset: Dataset,
  clause: GroupByClause
): { selectExpr: string; groupByExpr: string } {
  const field = findField(dataset, clause.dimension);
  const fieldRef = `${dataset.name}.${field.name}`;

  if (clause.grain) {
    // Time dimension with grain
    if (!field.dimension?.isTime) {
      throw new Error(
        `Cannot apply time grain "${clause.grain}" to non-time dimension "${clause.dimension}"`
      );
    }
    const grainSql = GRAIN_SQL[clause.grain];
    const truncExpr = `DATE_TRUNC('${grainSql}', ${fieldRef})`;
    const alias = `${field.name}_${clause.grain}`;
    return {
      selectExpr: `${truncExpr} AS ${alias}`,
      groupByExpr: truncExpr,
    };
  } else {
    // Non-time dimension (or time dimension without grain is an error)
    if (field.dimension?.isTime) {
      throw new Error(
        `Time dimension "${clause.dimension}" requires a grain (day, week, month, quarter, year) in groupBy`
      );
    }
    return {
      selectExpr: fieldRef,
      groupByExpr: fieldRef,
    };
  }
}

function resolveWhere(dataset: Dataset, clause: WhereClause): string {
  const field = dataset.fields.find((f) => f.name === clause.dimension);
  if (!field) {
    const available = dataset.fields.map((f) => f.name).join(", ");
    throw new Error(
      `Unknown field "${clause.dimension}" in WHERE clause. ` +
        `Available fields: ${available}`
    );
  }

  const fieldRef = `${dataset.name}.${field.name}`;

  switch (clause.operator) {
    case "=":
    case "!=":
    case ">":
    case "<":
    case ">=":
    case "<=":
      return `${fieldRef} ${clause.operator} ${quoteValue(clause.value)}`;
    case "in":
      return `${fieldRef} IN (${quoteArrayValues(clause.value)})`;
    case "not_in":
      return `${fieldRef} NOT IN (${quoteArrayValues(clause.value)})`;
    default:
      throw new Error(`Unknown operator "${clause.operator}"`);
  }
}

function resolveOrderBy(clause: OrderByClause): string {
  const direction = clause.direction === "desc" ? " DESC" : "";
  return `${clause.field}${direction}`;
}

function quoteValue(value: string | number | (string | number)[]): string {
  if (Array.isArray(value)) {
    throw new Error("Use 'in' or 'not_in' operator for array values");
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${escapeString(value)}'`;
}

function quoteArrayValues(
  value: string | number | (string | number)[]
): string {
  if (!Array.isArray(value)) {
    throw new Error("'in' and 'not_in' operators require an array value");
  }
  return value
    .map((v) => (typeof v === "number" ? String(v) : `'${escapeString(String(v))}'`))
    .join(", ");
}

function escapeString(str: string): string {
  return str.replace(/'/g, "''");
}
