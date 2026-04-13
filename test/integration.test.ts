import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import duckdb from "duckdb";
import { OsiRuntime } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, "../examples/retail_sales");

// Helper: run a SQL query against DuckDB and return rows
function query(
  db: duckdb.Database,
  sql: string
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, (err: Error | null, rows: Record<string, unknown>[]) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper: run a SQL statement (no result needed)
function exec(db: duckdb.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper: parse the YAML fixture as JSON-compatible object
// Since we don't want a YAML dependency, we have a JSON version of the fixture
function loadModel(): unknown {
  return {
    semantic_model: [
      {
        name: "retail_sales",
        datasets: [
          {
            name: "orders",
            source: "orders",
            primary_key: ["order_id"],
            fields: [
              {
                name: "order_id",
                expression: {
                  dialects: [
                    { dialect: "ANSI_SQL", expression: "order_id" },
                  ],
                },
              },
              {
                name: "order_date",
                expression: {
                  dialects: [
                    { dialect: "ANSI_SQL", expression: "order_date" },
                  ],
                },
                dimension: { is_time: true },
              },
              {
                name: "region",
                expression: {
                  dialects: [{ dialect: "ANSI_SQL", expression: "region" }],
                },
                dimension: { is_time: false },
              },
              {
                name: "product_tier",
                expression: {
                  dialects: [
                    { dialect: "ANSI_SQL", expression: "product_tier" },
                  ],
                },
                dimension: { is_time: false },
              },
              {
                name: "amount",
                expression: {
                  dialects: [{ dialect: "ANSI_SQL", expression: "amount" }],
                },
              },
            ],
          },
        ],
        metrics: [
          {
            name: "total_sales",
            expression: {
              dialects: [
                { dialect: "ANSI_SQL", expression: "SUM(orders.amount)" },
              ],
            },
          },
          {
            name: "average_order_value",
            expression: {
              dialects: [
                { dialect: "ANSI_SQL", expression: "AVG(orders.amount)" },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("integration: OsiRuntime → DuckDB", () => {
  let db: duckdb.Database;
  let runtime: OsiRuntime;

  before(async () => {
    // Create in-memory DuckDB and load schema + data
    db = new duckdb.Database(":memory:");
    const schema = readFileSync(resolve(EXAMPLES_DIR, "schema.sql"), "utf-8");
    const data = readFileSync(
      resolve(EXAMPLES_DIR, "sample_data.sql"),
      "utf-8"
    );
    await exec(db, schema);
    await exec(db, data);

    // Create runtime from model
    runtime = new OsiRuntime(loadModel());
  });

  after(() => {
    db.close();
  });

  it("total_sales with no groupBy matches manual query", async () => {
    const sql = runtime.toSQL({ metric: "total_sales" });
    const osiResult = await query(db, sql);
    const manualResult = await query(
      db,
      "SELECT SUM(amount) AS total_sales FROM orders"
    );

    assert.equal(osiResult.length, 1);
    assert.equal(
      Number(osiResult[0]["total_sales"]),
      Number(manualResult[0]["total_sales"])
    );
  });

  it("total_sales grouped by region matches manual query", async () => {
    const sql = runtime.toSQL({
      metric: "total_sales",
      groupBy: [{ dimension: "region" }],
    });
    const osiResult = await query(db, sql);
    const manualResult = await query(
      db,
      "SELECT region, SUM(amount) AS total_sales FROM orders GROUP BY region ORDER BY region"
    );

    // Sort both by region for comparison
    const sortByRegion = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a["region"]).localeCompare(String(b["region"]));
    osiResult.sort(sortByRegion);
    manualResult.sort(sortByRegion);

    assert.equal(osiResult.length, manualResult.length);
    for (let i = 0; i < osiResult.length; i++) {
      assert.equal(osiResult[i]["region"], manualResult[i]["region"]);
      assert.equal(
        Number(osiResult[i]["total_sales"]),
        Number(manualResult[i]["total_sales"])
      );
    }
  });

  it("total_sales grouped by order_date at weekly grain produces weekly buckets", async () => {
    const sql = runtime.toSQL({
      metric: "total_sales",
      groupBy: [{ dimension: "order_date", grain: "week" }],
    });
    const result = await query(db, sql);

    // Should have multiple weeks
    assert.ok(result.length > 10, `Expected many weekly buckets, got ${result.length}`);

    // Each row should have an order_date_week that's a Monday
    for (const row of result) {
      const date = new Date(String(row["order_date_week"]));
      assert.equal(date.getUTCDay(), 1, `Expected Monday, got day ${date.getUTCDay()} for ${row["order_date_week"]}`);
    }
  });

  it("total_sales with where region = 'northeast' matches manual query", async () => {
    const sql = runtime.toSQL({
      metric: "total_sales",
      where: [{ dimension: "region", operator: "=", value: "northeast" }],
    });
    const osiResult = await query(db, sql);
    const manualResult = await query(
      db,
      "SELECT SUM(amount) AS total_sales FROM orders WHERE region = 'northeast'"
    );

    assert.equal(
      Number(osiResult[0]["total_sales"]),
      Number(manualResult[0]["total_sales"])
    );
  });

  it("average_order_value matches manual query", async () => {
    const sql = runtime.toSQL({ metric: "average_order_value" });
    const osiResult = await query(db, sql);
    const manualResult = await query(
      db,
      "SELECT AVG(amount) AS average_order_value FROM orders"
    );

    const osiVal = Number(osiResult[0]["average_order_value"]);
    const manualVal = Number(manualResult[0]["average_order_value"]);
    // Use approximate comparison for floating point
    assert.ok(
      Math.abs(osiVal - manualVal) < 0.01,
      `Expected ~${manualVal}, got ${osiVal}`
    );
  });

  it("total_sales with groupBy + where combined", async () => {
    const sql = runtime.toSQL({
      metric: "total_sales",
      groupBy: [{ dimension: "product_tier" }],
      where: [
        { dimension: "region", operator: "in", value: ["northeast", "southeast"] },
      ],
    });
    const osiResult = await query(db, sql);
    const manualResult = await query(
      db,
      "SELECT product_tier, SUM(amount) AS total_sales FROM orders WHERE region IN ('northeast', 'southeast') GROUP BY product_tier ORDER BY product_tier"
    );

    const sortByTier = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a["product_tier"]).localeCompare(String(b["product_tier"]));
    osiResult.sort(sortByTier);
    manualResult.sort(sortByTier);

    assert.equal(osiResult.length, manualResult.length);
    for (let i = 0; i < osiResult.length; i++) {
      assert.equal(osiResult[i]["product_tier"], manualResult[i]["product_tier"]);
      assert.equal(
        Number(osiResult[i]["total_sales"]),
        Number(manualResult[i]["total_sales"])
      );
    }
  });

  it("orderBy + limit returns correct number of rows in correct order", async () => {
    const sql = runtime.toSQL({
      metric: "total_sales",
      groupBy: [{ dimension: "region" }],
      orderBy: [{ field: "total_sales", direction: "desc" }],
      limit: 2,
    });
    const result = await query(db, sql);

    assert.equal(result.length, 2);
    // First row should have higher total_sales than second
    assert.ok(
      Number(result[0]["total_sales"]) >= Number(result[1]["total_sales"]),
      "Results should be in descending order"
    );
  });
});
