import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OsiRuntime } from "../src/index.js";

const MINIMAL_MODEL = {
  semantic_model: [
    {
      name: "test",
      datasets: [
        {
          name: "orders",
          source: "orders",
          fields: [
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
      ],
    },
  ],
};

describe("OsiRuntime", () => {
  it("constructs with default dialect (ansi)", () => {
    const runtime = new OsiRuntime(MINIMAL_MODEL);
    assert.ok(runtime);
  });

  it("constructs with explicit ansi dialect", () => {
    const runtime = new OsiRuntime(MINIMAL_MODEL, "ansi");
    assert.ok(runtime);
  });

  it("throws on unsupported dialect: bigquery", () => {
    assert.throws(
      () => new OsiRuntime(MINIMAL_MODEL, "bigquery"),
      /dialect "bigquery" is not yet supported/
    );
  });

  it("throws on unsupported dialect: mysql", () => {
    assert.throws(
      () => new OsiRuntime(MINIMAL_MODEL, "mysql"),
      /dialect "mysql" is not yet supported/
    );
  });

  it("toSQL works after construction", () => {
    const runtime = new OsiRuntime(MINIMAL_MODEL);
    const sql = runtime.toSQL({ metric: "total_sales" });
    assert.equal(
      sql,
      "SELECT SUM(orders.amount) AS total_sales FROM orders AS orders"
    );
  });

  it("listMetrics returns all metrics", () => {
    const runtime = new OsiRuntime(MINIMAL_MODEL);
    const metrics = runtime.listMetrics();
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].name, "total_sales");
  });

  it("dimensionsForMetric returns empty for model with no dimensions", () => {
    const runtime = new OsiRuntime(MINIMAL_MODEL);
    const dims = runtime.dimensionsForMetric("total_sales");
    assert.equal(dims.length, 0);
  });
});

const MODEL_WITH_PRIMARY_TIME = {
  semantic_model: [
    {
      name: "test",
      datasets: [
        {
          name: "orders",
          source: "orders",
          fields: [
            {
              name: "order_date",
              expression: {
                dialects: [{ dialect: "ANSI_SQL", expression: "order_date" }],
              },
              dimension: { is_time: true, is_primary: true },
              description: "Date the order was placed",
            },
            {
              name: "ship_date",
              expression: {
                dialects: [{ dialect: "ANSI_SQL", expression: "ship_date" }],
              },
              dimension: { is_time: true },
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
      ],
    },
  ],
};

describe("OsiRuntime.primaryTimeForMetric", () => {
  it("returns the primary time field for a metric whose dataset has one", () => {
    const runtime = new OsiRuntime(MODEL_WITH_PRIMARY_TIME);
    const primary = runtime.primaryTimeForMetric("total_sales");
    assert.equal(primary?.name, "order_date");
    assert.equal(primary?.isTime, true);
    assert.equal(primary?.dataset, "orders");
    assert.equal(primary?.description, "Date the order was placed");
  });

  it("returns null when the metric's dataset has no primary time", () => {
    const runtime = new OsiRuntime(MINIMAL_MODEL);
    const primary = runtime.primaryTimeForMetric("total_sales");
    assert.equal(primary, null);
  });

  it("throws on unknown metric", () => {
    const runtime = new OsiRuntime(MODEL_WITH_PRIMARY_TIME);
    assert.throws(
      () => runtime.primaryTimeForMetric("nonexistent"),
      /Unknown metric "nonexistent"/
    );
  });
});
