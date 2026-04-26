import type {
  SemanticModel,
  Dataset,
  Field,
  Dimension,
  Expression,
  Dialect,
  SqlDialect,
  Metric,
  Relationship,
  AiContext,
} from "./model.js";

const VALID_DIALECTS = new Set([
  "ANSI_SQL",
  "SNOWFLAKE",
  "MDX",
  "TABLEAU",
  "DATABRICKS",
]);

const RESERVED_GRAIN_WORDS = new Set([
  "day",
  "week",
  "month",
  "quarter",
  "year",
]);

/**
 * Parse a raw OSI YAML object (already deserialized from YAML/JSON)
 * into a validated SemanticModel.
 *
 * The consumer is responsible for YAML/JSON deserialization — this
 * function accepts the resulting plain object.
 */
export function parseModel(raw: unknown): SemanticModel {
  if (!raw || typeof raw !== "object") {
    throw new Error("Model must be a non-null object");
  }

  const obj = raw as Record<string, unknown>;

  // OSI wraps the model in a `semantic_model` array
  const modelArray = obj["semantic_model"];
  if (!Array.isArray(modelArray) || modelArray.length === 0) {
    throw new Error(
      'Model must have a "semantic_model" array with at least one entry'
    );
  }

  const modelObj = modelArray[0] as Record<string, unknown>;
  return parseSemanticModel(modelObj);
}

function parseSemanticModel(obj: Record<string, unknown>): SemanticModel {
  const name = requireString(obj, "name", "semantic_model");

  const datasetsRaw = obj["datasets"];
  if (!Array.isArray(datasetsRaw) || datasetsRaw.length === 0) {
    throw new Error("semantic_model must have at least one dataset");
  }

  const datasets = datasetsRaw.map((d, i) =>
    parseDataset(d as Record<string, unknown>, i)
  );

  const metricsRaw = obj["metrics"];
  const metrics = Array.isArray(metricsRaw)
    ? metricsRaw.map((m, i) => parseMetric(m as Record<string, unknown>, i))
    : [];

  const relationshipsRaw = obj["relationships"];
  const relationships = Array.isArray(relationshipsRaw)
    ? relationshipsRaw.map((r, i) =>
        parseRelationship(r as Record<string, unknown>, i)
      )
    : undefined;

  return {
    name,
    description: optionalString(obj, "description"),
    aiContext: parseAiContext(obj["ai_context"]),
    datasets,
    metrics,
    relationships,
  };
}

function parseDataset(obj: Record<string, unknown>, index: number): Dataset {
  const ctx = `datasets[${index}]`;
  const name = requireString(obj, "name", ctx);
  const source = requireString(obj, "source", ctx);

  const primaryKeyRaw = obj["primary_key"];
  const primaryKey = Array.isArray(primaryKeyRaw)
    ? primaryKeyRaw.map(String)
    : undefined;

  const fieldsRaw = obj["fields"];
  const fields = Array.isArray(fieldsRaw)
    ? fieldsRaw.map((f, i) => parseField(f as Record<string, unknown>, i, ctx))
    : [];

  const primaryFields = fields.filter((f) => f.dimension?.isPrimary);
  if (primaryFields.length > 1) {
    const names = primaryFields.map((f) => f.name).join(", ");
    throw new Error(
      `${ctx}: at most one field may be marked is_primary, found: ${names}`
    );
  }

  return {
    name,
    source,
    primaryKey,
    fields,
    description: optionalString(obj, "description"),
    aiContext: parseAiContext(obj["ai_context"]),
  };
}

function parseField(
  obj: Record<string, unknown>,
  index: number,
  parentCtx: string
): Field {
  const ctx = `${parentCtx}.fields[${index}]`;
  const name = requireString(obj, "name", ctx);
  checkReservedName(name, ctx);
  const expression = parseExpression(obj["expression"], ctx);
  const dimension = parseDimension(obj["dimension"]);

  if (dimension?.isPrimary && !dimension.isTime) {
    throw new Error(
      `${ctx}.dimension is_primary requires is_time: true`
    );
  }

  return {
    name,
    expression,
    dimension,
    label: optionalString(obj, "label"),
    description: optionalString(obj, "description"),
    aiContext: parseAiContext(obj["ai_context"]),
  };
}

function parseDimension(raw: unknown): Dimension | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const obj = raw as Record<string, unknown>;
  const isPrimary = obj["is_primary"] === true;
  return {
    isTime: obj["is_time"] === true,
    isPrimary: isPrimary ? true : undefined,
  };
}

function parseExpression(raw: unknown, ctx: string): Expression {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${ctx} must have an "expression" object`);
  }

  const obj = raw as Record<string, unknown>;
  const dialectsRaw = obj["dialects"];

  if (!Array.isArray(dialectsRaw) || dialectsRaw.length === 0) {
    throw new Error(`${ctx}.expression must have at least one dialect`);
  }

  const dialects = dialectsRaw.map((d, i) =>
    parseDialect(d as Record<string, unknown>, i, ctx)
  );

  return { dialects };
}

function parseDialect(
  obj: Record<string, unknown>,
  index: number,
  parentCtx: string
): Dialect {
  const ctx = `${parentCtx}.expression.dialects[${index}]`;
  const dialect = requireString(obj, "dialect", ctx);

  if (!VALID_DIALECTS.has(dialect)) {
    throw new Error(
      `${ctx}.dialect must be one of: ${[...VALID_DIALECTS].join(", ")}. Got: "${dialect}"`
    );
  }

  const expression = requireString(obj, "expression", ctx);

  return {
    dialect: dialect as SqlDialect,
    expression,
  };
}

function parseMetric(obj: Record<string, unknown>, index: number): Metric {
  const ctx = `metrics[${index}]`;
  const name = requireString(obj, "name", ctx);
  checkReservedName(name, ctx);
  const expression = parseExpression(obj["expression"], ctx);

  return {
    name,
    expression,
    description: optionalString(obj, "description"),
    aiContext: parseAiContext(obj["ai_context"]),
  };
}

function parseRelationship(
  obj: Record<string, unknown>,
  index: number
): Relationship {
  const ctx = `relationships[${index}]`;
  const name = requireString(obj, "name", ctx);
  const from = requireString(obj, "from", ctx);
  const to = requireString(obj, "to", ctx);

  const fromColumnsRaw = obj["from_columns"];
  if (!Array.isArray(fromColumnsRaw) || fromColumnsRaw.length === 0) {
    throw new Error(`${ctx} must have a non-empty "from_columns" array`);
  }

  const toColumnsRaw = obj["to_columns"];
  if (!Array.isArray(toColumnsRaw) || toColumnsRaw.length === 0) {
    throw new Error(`${ctx} must have a non-empty "to_columns" array`);
  }

  return {
    name,
    from,
    to,
    fromColumns: fromColumnsRaw.map(String),
    toColumns: toColumnsRaw.map(String),
    aiContext: parseAiContext(obj["ai_context"]),
  };
}

function parseAiContext(raw: unknown): AiContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const obj = raw as Record<string, unknown>;
  const synonymsRaw = obj["synonyms"];

  return {
    instructions: optionalString(obj, "instructions"),
    synonyms: Array.isArray(synonymsRaw)
      ? synonymsRaw.map(String)
      : undefined,
  };
}

function checkReservedName(name: string, ctx: string): void {
  if (RESERVED_GRAIN_WORDS.has(name.toLowerCase())) {
    throw new Error(
      `${ctx}.name "${name}" is a reserved grain word and cannot be used as an identifier`
    );
  }
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  ctx: string
): string {
  const val = obj[key];
  if (typeof val !== "string" || val.length === 0) {
    throw new Error(`${ctx} must have a non-empty string "${key}"`);
  }
  return val;
}

function optionalString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
}
