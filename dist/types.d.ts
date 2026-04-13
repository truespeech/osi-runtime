/**
 * Public query API types for the OSI runtime.
 */
export type TimeGrain = "day" | "week" | "month" | "quarter" | "year";
export type WhereOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in";
export interface DimensionGroupBy {
    dimension: string;
    grain?: undefined;
}
export interface TimeDimensionGroupBy {
    dimension: string;
    grain: TimeGrain;
}
export type GroupByClause = DimensionGroupBy | TimeDimensionGroupBy;
export interface WhereClause {
    dimension: string;
    operator: WhereOperator;
    value: string | number | (string | number)[];
}
export interface OrderByClause {
    field: string;
    direction?: "asc" | "desc";
}
export interface SemanticQuery {
    metric: string;
    groupBy?: GroupByClause[];
    where?: WhereClause[];
    orderBy?: OrderByClause[];
    limit?: number;
}
export interface MetricInfo {
    name: string;
    description?: string;
    aiContext?: {
        instructions?: string;
        synonyms?: string[];
    };
}
export interface DimensionInfo {
    name: string;
    isTime: boolean;
    dataset: string;
    description?: string;
    aiContext?: {
        instructions?: string;
        synonyms?: string[];
    };
}
export interface QueryResult {
    columns: string[];
    rows: (string | number | null)[][];
}
