import type { PriceAdapter } from "../types";

export const manualPriceAdapter: PriceAdapter = {
  sourceKey: "manual",
  async fetch() {
    return {
      status: "ERROR",
      observations: [],
      error: "Manual mappings must be updated with an observation.",
    };
  },
};
