import type { SemanticModel } from "./model.js";
import type { SemanticQuery } from "./types.js";
/**
 * Generate a SQL query from a semantic model and a query specification.
 *
 * The generated SQL uses ANSI SQL dialect with DATE_TRUNC for time
 * grain handling (compatible with DuckDB, Snowflake, Postgres, etc.).
 */
export declare function toSQL(model: SemanticModel, query: SemanticQuery): string;
