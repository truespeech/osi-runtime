import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseModel } from "../src/parser.js";

const MINIMAL_MODEL = {
  semantic_model: [
    {
      name: "test_model",
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

const FULL_MODEL = {
  semantic_model: [
    {
      name: "retail_sales",
      description: "Sales analytics model",
      ai_context: {
        instructions: "Use for sales analysis",
      },
      datasets: [
        {
          name: "orders",
          source: "warehouse.public.orders",
          primary_key: ["order_id"],
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
              description: "Date the order was placed",
              ai_context: { synonyms: ["date", "sale date"] },
            },
            {
              name: "region",
              expression: {
                dialects: [{ dialect: "ANSI_SQL", expression: "region" }],
              },
              dimension: { is_time: false },
              ai_context: { synonyms: ["territory"] },
            },
            {
              name: "product_tier",
              expression: {
                dialects: [
                  { dialect: "ANSI_SQL", expression: "product_tier" },
                ],
              },
              dimension: { is_time: false },
              ai_context: {
                synonyms: ["tier"],
                instructions: "Values are 'enterprise' and 'consumer'",
              },
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
          description: "Total gross sales",
          expression: {
            dialects: [
              { dialect: "ANSI_SQL", expression: "SUM(orders.amount)" },
            ],
          },
          ai_context: { synonyms: ["sales", "revenue"] },
        },
        {
          name: "average_order_value",
          description: "Average value per order",
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

describe("parseModel", () => {
  it("parses a minimal valid model", () => {
    const model = parseModel(MINIMAL_MODEL);
    assert.equal(model.name, "test_model");
    assert.equal(model.datasets.length, 1);
    assert.equal(model.datasets[0].name, "orders");
    assert.equal(model.datasets[0].source, "orders");
    assert.equal(model.metrics.length, 1);
    assert.equal(model.metrics[0].name, "total_sales");
  });

  it("parses a full model with all fields", () => {
    const model = parseModel(FULL_MODEL);
    assert.equal(model.name, "retail_sales");
    assert.equal(model.description, "Sales analytics model");
    assert.equal(model.datasets[0].source, "warehouse.public.orders");
    assert.deepEqual(model.datasets[0].primaryKey, ["order_id"]);
    assert.equal(model.datasets[0].fields.length, 5);
    assert.equal(model.metrics.length, 2);
  });

  it("parses time dimensions correctly", () => {
    const model = parseModel(FULL_MODEL);
    const orderDate = model.datasets[0].fields.find(
      (f) => f.name === "order_date"
    );
    assert.ok(orderDate?.dimension);
    assert.equal(orderDate.dimension.isTime, true);
  });

  it("parses non-time dimensions correctly", () => {
    const model = parseModel(FULL_MODEL);
    const region = model.datasets[0].fields.find((f) => f.name === "region");
    assert.ok(region?.dimension);
    assert.equal(region.dimension.isTime, false);
  });

  it("parses ai_context at model level", () => {
    const model = parseModel(FULL_MODEL);
    assert.ok(model.aiContext);
    assert.equal(model.aiContext.instructions, "Use for sales analysis");
  });

  it("parses ai_context with synonyms on fields", () => {
    const model = parseModel(FULL_MODEL);
    const orderDate = model.datasets[0].fields.find(
      (f) => f.name === "order_date"
    );
    assert.ok(orderDate?.aiContext);
    assert.deepEqual(orderDate.aiContext.synonyms, ["date", "sale date"]);
  });

  it("parses ai_context with synonyms and instructions on fields", () => {
    const model = parseModel(FULL_MODEL);
    const tier = model.datasets[0].fields.find(
      (f) => f.name === "product_tier"
    );
    assert.ok(tier?.aiContext);
    assert.deepEqual(tier.aiContext.synonyms, ["tier"]);
    assert.equal(
      tier.aiContext.instructions,
      "Values are 'enterprise' and 'consumer'"
    );
  });

  it("parses ai_context on metrics", () => {
    const model = parseModel(FULL_MODEL);
    const metric = model.metrics.find((m) => m.name === "total_sales");
    assert.ok(metric?.aiContext);
    assert.deepEqual(metric.aiContext.synonyms, ["sales", "revenue"]);
  });

  it("throws on null input", () => {
    assert.throws(() => parseModel(null), /must be a non-null object/);
  });

  it("throws on missing semantic_model wrapper", () => {
    assert.throws(
      () => parseModel({ name: "test" }),
      /must have a "semantic_model" array/
    );
  });

  it("throws on empty semantic_model array", () => {
    assert.throws(
      () => parseModel({ semantic_model: [] }),
      /must have a "semantic_model" array with at least one entry/
    );
  });

  it("throws on missing model name", () => {
    assert.throws(
      () =>
        parseModel({
          semantic_model: [{ datasets: [{ name: "d", source: "s" }] }],
        }),
      /must have a non-empty string "name"/
    );
  });

  it("throws on missing dataset source", () => {
    assert.throws(
      () =>
        parseModel({
          semantic_model: [
            {
              name: "m",
              datasets: [{ name: "d", fields: [] }],
            },
          ],
        }),
      /must have a non-empty string "source"/
    );
  });

  it("throws on missing expression in metric", () => {
    assert.throws(
      () =>
        parseModel({
          semantic_model: [
            {
              name: "m",
              datasets: [{ name: "d", source: "s" }],
              metrics: [{ name: "bad_metric" }],
            },
          ],
        }),
      /must have an "expression" object/
    );
  });

  it("throws on invalid dialect", () => {
    assert.throws(
      () =>
        parseModel({
          semantic_model: [
            {
              name: "m",
              datasets: [
                {
                  name: "d",
                  source: "s",
                  fields: [
                    {
                      name: "f",
                      expression: {
                        dialects: [
                          { dialect: "INVALID_SQL", expression: "f" },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      /must be one of/
    );
  });
});
