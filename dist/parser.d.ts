import type { SemanticModel } from "./model.js";
/**
 * Parse a raw OSI YAML object (already deserialized from YAML/JSON)
 * into a validated SemanticModel.
 *
 * The consumer is responsible for YAML/JSON deserialization — this
 * function accepts the resulting plain object.
 */
export declare function parseModel(raw: unknown): SemanticModel;
