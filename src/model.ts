/**
 * Internal model types representing a parsed OSI semantic model.
 * These mirror the OSI YAML structure but use camelCase and
 * TypeScript-native types.
 */

export interface SemanticModel {
  name: string;
  description?: string;
  aiContext?: AiContext;
  datasets: Dataset[];
  metrics: Metric[];
  relationships?: Relationship[];
}

export interface Dataset {
  name: string;
  source: string;
  primaryKey?: string[];
  fields: Field[];
  description?: string;
  aiContext?: AiContext;
}

export interface Field {
  name: string;
  expression: Expression;
  dimension?: Dimension;
  label?: string;
  description?: string;
  aiContext?: AiContext;
}

export interface Dimension {
  isTime: boolean;
}

export interface Expression {
  dialects: Dialect[];
}

export interface Dialect {
  dialect: SqlDialect;
  expression: string;
}

export type SqlDialect =
  | "ANSI_SQL"
  | "SNOWFLAKE"
  | "MDX"
  | "TABLEAU"
  | "DATABRICKS";

export interface Metric {
  name: string;
  expression: Expression;
  description?: string;
  aiContext?: AiContext;
}

export interface Relationship {
  name: string;
  from: string;
  to: string;
  fromColumns: string[];
  toColumns: string[];
  aiContext?: AiContext;
}

export interface AiContext {
  instructions?: string;
  synonyms?: string[];
}
