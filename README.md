# OSI Runtime

An open-source runtime for [OSI (Open Semantic Interchange)](https://open-semantic-interchange.org/) semantic models. It reads an OSI YAML definition and generates SQL from programmatic semantic queries — you ask for a metric by name, and it produces the correct query.

**[Try the interactive demo →](https://truespeech.io/osi-runtime.html)** · Part of the [truespeech](https://truespeech.io) project

## What it does

OSI is a [vendor-neutral standard](https://github.com/open-semantic-interchange/OSI) for describing semantic models — metrics, dimensions, datasets, and relationships. This runtime is the bridge between an OSI model definition and a SQL database: given a metric name and dimension constraints, it generates the correct SQL query.

The runtime is **database-agnostic** — it generates SQL but does not execute it. You provide the database connection; the runtime provides the query. Currently generates ANSI SQL compatible with DuckDB, PostgreSQL, and Snowflake. BigQuery and MySQL dialects are planned.

## Quick start

```typescript
import { OsiRuntime } from './dist/index.js';

// Parse your OSI YAML into a JavaScript object (you handle YAML parsing)
const model = { semantic_model: [{ name: "my_model", datasets: [...], metrics: [...] }] };

const runtime = new OsiRuntime(model);

// List available metrics
runtime.listMetrics();
// → [{ name: "total_sales", description: "Total gross sales revenue" }, ...]

// List dimensions for a metric
runtime.dimensionsForMetric("total_sales");
// → [{ name: "order_date", isTime: true }, { name: "region", isTime: false }, ...]

// Generate SQL
runtime.toSQL({ metric: "total_sales" });
// → 'SELECT SUM(orders.amount) AS total_sales FROM orders AS orders'

runtime.toSQL({
  metric: "total_sales",
  groupBy: [{ dimension: "region" }],
  where: [{ dimension: "product_tier", operator: "=", value: "enterprise" }]
});
// → 'SELECT orders.region, SUM(orders.amount) AS total_sales
//    FROM orders AS orders
//    WHERE orders.product_tier = 'enterprise'
//    GROUP BY orders.region'

// Time dimensions require a grain
runtime.toSQL({
  metric: "total_sales",
  groupBy: [{ dimension: "order_date", grain: "week" }]
});
// → 'SELECT DATE_TRUNC('week', orders.order_date) AS order_date_week,
//    SUM(orders.amount) AS total_sales
//    FROM orders AS orders
//    GROUP BY DATE_TRUNC('week', orders.order_date)'
```

## API

### `new OsiRuntime(rawModel, dialect?)`

Create a runtime from a parsed OSI model object. The `rawModel` parameter should be the result of deserializing an OSI YAML file — the runtime does not parse YAML itself, keeping it dependency-free.

The optional `dialect` parameter selects the target SQL dialect:
- `"ansi"` (default) — ANSI SQL, compatible with DuckDB, PostgreSQL, Snowflake
- `"bigquery"` — not yet supported
- `"mysql"` — not yet supported

### `runtime.listMetrics(): MetricInfo[]`

Returns all metrics defined in the semantic model, with descriptions and AI context (synonyms, instructions).

### `runtime.dimensionsForMetric(name): DimensionInfo[]`

Returns all dimensions that can be used to query the given metric. Each dimension indicates whether it is a time dimension (`isTime: true`).

### `runtime.primaryTimeForMetric(name): DimensionInfo | null`

Returns the primary time dimension for the metric's home dataset, or `null` if none is declared. Useful for callers (such as higher-level languages or query builders) that need to know which time field is the metric's natural temporal axis without scanning all dimensions. Throws if the metric is not found.

### `runtime.toSQL(query): string`

The core method. Generates a SQL query from a `SemanticQuery` object:

```typescript
interface SemanticQuery {
  metric: string;                    // required: metric name
  groupBy?: GroupByClause[];         // optional: dimensions to group by
  where?: WhereClause[];             // optional: filters
  orderBy?: OrderByClause[];         // optional: sorting
  limit?: number;                    // optional: row limit
}
```

**GroupBy** supports two forms:
- Non-time dimensions: `{ dimension: "region" }`
- Time dimensions with grain: `{ dimension: "order_date", grain: "week" }`
- Valid grains: `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"`

**Where** clauses take explicit values:
- `{ dimension: "region", operator: "=", value: "northeast" }`
- Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `in`, `not_in`
- Values are always explicit — the runtime does not resolve relative time periods like "last week" (that's the caller's responsibility)

### `runtime.getModel(): SemanticModel`

Returns the parsed semantic model (read-only).

## OSI model format

The runtime accepts the [OSI v1.0 YAML format](https://github.com/open-semantic-interchange/OSI/blob/main/core-spec/spec.md). A minimal model looks like:

```yaml
semantic_model:
  - name: retail_sales
    datasets:
      - name: orders
        source: orders
        fields:
          - name: order_date
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: "order_date"
            dimension:
              is_time: true
          - name: region
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: "region"
            dimension:
              is_time: false
          - name: amount
            expression:
              dialects:
                - dialect: ANSI_SQL
                  expression: "amount"
    metrics:
      - name: total_sales
        description: Total gross sales revenue
        expression:
          dialects:
            - dialect: ANSI_SQL
              expression: "SUM(orders.amount)"
```

A complete example with AI context, multiple metrics, and sample data is in [`examples/retail_sales/`](examples/retail_sales/).

### Primary time dimension

A time dimension can additionally be marked as the **primary** time for its dataset:

```yaml
fields:
  - name: order_date
    expression:
      dialects:
        - dialect: ANSI_SQL
          expression: "order_date"
    dimension:
      is_time: true
      is_primary: true
```

The primary time dimension is the dataset's natural temporal axis — what most queries against the dataset are naturally scoped by. Higher-level languages built on top of OSI (like the True Speech runtime) use it to support implicit time anchoring in queries. The runtime exposes it via `primaryTimeForMetric()`.

Rules:
- A field marked `is_primary: true` must also have `is_time: true`.
- At most one field per dataset may be marked `is_primary: true`.
- The flag is optional — datasets without a primary time still parse cleanly.

### Reserved identifier names

The following names are reserved and cannot be used as field or metric names: `day`, `week`, `month`, `quarter`, `year`. These are reserved as time grains by higher-level languages built on top of OSI. The check is case-insensitive.

## Development

### Prerequisites

- Node.js 20+

### Setup

```bash
git clone https://github.com/truespeech/osi-runtime.git
cd osi-runtime
npm install
```

### Build

```bash
npm run build
```

Compiles TypeScript from `src/` to `dist/`. The compiled JavaScript files are ES modules with no external dependencies.

### Test

```bash
npm test
```

Runs unit tests (parser validation, SQL generation) and integration tests (generated SQL executed against a real in-memory DuckDB instance loaded with sample data).

The test suite has 75 tests covering:
- **Parser tests** — valid models, error cases, AI context at all levels
- **Resolver tests** — all clause types, all 5 time grains, all operators, error cases
- **Integration tests** — generated SQL executed against DuckDB, results verified against manual queries
- **Runtime tests** — public API, dialect support

### Project structure

```
src/
├── index.ts       # OsiRuntime class, public API
├── model.ts       # Internal model types (mirrors OSI YAML)
├── types.ts       # Public query types (SemanticQuery, etc.)
├── parser.ts      # Parse raw OSI object → validated model
└── resolver.ts    # SemanticQuery → SQL string
dist/              # Compiled JavaScript + type declarations
test/
├── parser.test.ts
├── resolver.test.ts
├── runtime.test.ts
└── integration.test.ts
examples/
└── retail_sales/
    ├── schema.sql
    ├── sample_data.sql
    └── semantic_model.yaml
```

## Using in the browser

The compiled `dist/` files are dependency-free ES modules that work directly in the browser. You can load them from jsDelivr:

```javascript
import { OsiRuntime } from 'https://cdn.jsdelivr.net/gh/truespeech/osi-runtime@main/dist/index.js';
```

See the [interactive demo](https://truespeech.io/osi-runtime.html) for a working example with DuckDB-WASM running entirely in the browser.

## License

Apache 2.0
