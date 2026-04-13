import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseModel } from "../src/parser.js";
import { toSQL } from "../src/resolver.js";
import type { SemanticModel } from "../src/model.js";

const MODEL_RAW = {
  semantic_model: [
    {
      name: "retail_sales",
      datasets: [
        {
          name: "orders",
          source: "orders",
          fields: [
            {
              name: "order_id",
              expression: {
                dialects: [{ dialect: "ANSI_SQL", expression: "order_id" }],
              },
            },
            {
              name: "order_date",
              expression: {
                dialects: [{ dialect: "ANSI_SQL", expression: "order_date" }],
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

let model: SemanticModel;

describe("toSQL", () => {
  // Parse model once for all tests
  model = parseModel(MODEL_RAW);

  describe("basic metric queries", () => {
    it("generates SQL for a simple metric with no groupBy", () => {
      const sql = toSQL(model, { metric: "total_sales" });
      assert.equal(sql, "SELECT SUM(orders.amount) AS total_sales FROM orders AS orders");
    });

    it("generates SQL for average_order_value", () => {
      const sql = toSQL(model, { metric: "average_order_value" });
      assert.equal(
        sql,
        "SELECT AVG(orders.amount) AS average_order_value FROM orders AS orders"
      );
    });
  });

  describe("groupBy", () => {
    it("groups by a non-time dimension", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "region" }],
      });
      assert.equal(
        sql,
        "SELECT orders.region, SUM(orders.amount) AS total_sales FROM orders AS orders GROUP BY orders.region"
      );
    });

    it("groups by multiple non-time dimensions", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "region" }, { dimension: "product_tier" }],
      });
      assert.equal(
        sql,
        "SELECT orders.region, orders.product_tier, SUM(orders.amount) AS total_sales FROM orders AS orders GROUP BY orders.region, orders.product_tier"
      );
    });

    it("groups by time dimension with day grain", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "order_date", grain: "day" }],
      });
      assert.equal(
        sql,
        "SELECT DATE_TRUNC('day', orders.order_date) AS order_date_day, SUM(orders.amount) AS total_sales FROM orders AS orders GROUP BY DATE_TRUNC('day', orders.order_date)"
      );
    });

    it("groups by time dimension with week grain", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "order_date", grain: "week" }],
      });
      assert.match(sql, /DATE_TRUNC\('week', orders\.order_date\)/);
      assert.match(sql, /AS order_date_week/);
    });

    it("groups by time dimension with month grain", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "order_date", grain: "month" }],
      });
      assert.match(sql, /DATE_TRUNC\('month', orders\.order_date\)/);
      assert.match(sql, /AS order_date_month/);
    });

    it("groups by time dimension with quarter grain", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "order_date", grain: "quarter" }],
      });
      assert.match(sql, /DATE_TRUNC\('quarter', orders\.order_date\)/);
      assert.match(sql, /AS order_date_quarter/);
    });

    it("groups by time dimension with year grain", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "order_date", grain: "year" }],
      });
      assert.match(sql, /DATE_TRUNC\('year', orders\.order_date\)/);
      assert.match(sql, /AS order_date_year/);
    });

    it("groups by time dimension and non-time dimension together", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [
          { dimension: "order_date", grain: "month" },
          { dimension: "region" },
        ],
      });
      assert.match(sql, /DATE_TRUNC\('month', orders\.order_date\) AS order_date_month/);
      assert.match(sql, /orders\.region/);
      assert.match(sql, /GROUP BY DATE_TRUNC\('month', orders\.order_date\), orders\.region/);
    });
  });

  describe("where clauses", () => {
    it("filters with = operator (string value)", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [{ dimension: "region", operator: "=", value: "northeast" }],
      });
      assert.equal(
        sql,
        "SELECT SUM(orders.amount) AS total_sales FROM orders AS orders WHERE orders.region = 'northeast'"
      );
    });

    it("filters with != operator", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [{ dimension: "region", operator: "!=", value: "west" }],
      });
      assert.match(sql, /WHERE orders\.region != 'west'/);
    });

    it("filters with numeric value", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [{ dimension: "amount", operator: ">", value: 1000 }],
      });
      assert.match(sql, /WHERE orders\.amount > 1000/);
    });

    it("filters with IN operator", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [
          {
            dimension: "region",
            operator: "in",
            value: ["northeast", "southeast"],
          },
        ],
      });
      assert.match(sql, /WHERE orders\.region IN \('northeast', 'southeast'\)/);
    });

    it("filters with NOT IN operator", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [
          {
            dimension: "region",
            operator: "not_in",
            value: ["west"],
          },
        ],
      });
      assert.match(sql, /WHERE orders\.region NOT IN \('west'\)/);
    });

    it("filters with date value", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [
          { dimension: "order_date", operator: ">=", value: "2026-01-01" },
          { dimension: "order_date", operator: "<", value: "2026-04-01" },
        ],
      });
      assert.match(sql, /orders\.order_date >= '2026-01-01'/);
      assert.match(sql, /orders\.order_date < '2026-04-01'/);
    });

    it("joins multiple where clauses with AND", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [
          { dimension: "region", operator: "=", value: "northeast" },
          { dimension: "product_tier", operator: "=", value: "enterprise" },
        ],
      });
      assert.match(
        sql,
        /WHERE orders\.region = 'northeast' AND orders\.product_tier = 'enterprise'/
      );
    });

    it("escapes single quotes in string values", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        where: [{ dimension: "region", operator: "=", value: "it's" }],
      });
      assert.match(sql, /= 'it''s'/);
    });
  });

  describe("groupBy + where combined", () => {
    it("generates correct SQL with both groupBy and where", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "region" }],
        where: [
          { dimension: "product_tier", operator: "=", value: "enterprise" },
        ],
      });
      assert.equal(
        sql,
        "SELECT orders.region, SUM(orders.amount) AS total_sales FROM orders AS orders WHERE orders.product_tier = 'enterprise' GROUP BY orders.region"
      );
    });
  });

  describe("orderBy and limit", () => {
    it("adds ORDER BY clause", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "region" }],
        orderBy: [{ field: "total_sales", direction: "desc" }],
      });
      assert.match(sql, /ORDER BY total_sales DESC/);
    });

    it("defaults ORDER BY to ascending", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "region" }],
        orderBy: [{ field: "region" }],
      });
      assert.match(sql, /ORDER BY region$/);
    });

    it("adds LIMIT clause", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "region" }],
        limit: 5,
      });
      assert.match(sql, /LIMIT 5$/);
    });

    it("combines ORDER BY and LIMIT", () => {
      const sql = toSQL(model, {
        metric: "total_sales",
        groupBy: [{ dimension: "region" }],
        orderBy: [{ field: "total_sales", direction: "desc" }],
        limit: 3,
      });
      assert.match(sql, /ORDER BY total_sales DESC LIMIT 3$/);
    });
  });

  describe("error cases", () => {
    it("throws on unknown metric", () => {
      assert.throws(
        () => toSQL(model, { metric: "nonexistent" }),
        /Unknown metric "nonexistent"/
      );
    });

    it("throws on unknown dimension in groupBy", () => {
      assert.throws(
        () =>
          toSQL(model, {
            metric: "total_sales",
            groupBy: [{ dimension: "nonexistent" }],
          }),
        /Unknown dimension "nonexistent"/
      );
    });

    it("throws on unknown dimension in where", () => {
      assert.throws(
        () =>
          toSQL(model, {
            metric: "total_sales",
            where: [
              { dimension: "nonexistent", operator: "=", value: "x" },
            ],
          }),
        /Unknown field "nonexistent"/
      );
    });

    it("throws when applying grain to non-time dimension", () => {
      assert.throws(
        () =>
          toSQL(model, {
            metric: "total_sales",
            groupBy: [{ dimension: "region", grain: "week" }],
          }),
        /Cannot apply time grain.*non-time dimension/
      );
    });

    it("throws when time dimension used without grain", () => {
      assert.throws(
        () =>
          toSQL(model, {
            metric: "total_sales",
            groupBy: [{ dimension: "order_date" }],
          }),
        /requires a grain/
      );
    });
  });
});
