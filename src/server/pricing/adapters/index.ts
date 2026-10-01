import type { PriceAdapter } from "../types";
import { kamerastorePriceAdapter } from "./kamerastore";
import { manualPriceAdapter } from "./manual";
import { mpbPriceAdapter } from "./mpb";

const adapters: Record<string, PriceAdapter> = {
  manual: manualPriceAdapter,
  mpb: mpbPriceAdapter,
  kamerastore: kamerastorePriceAdapter,
};

export function getPriceAdapter(sourceKey: string): PriceAdapter | null {
  return adapters[sourceKey] ?? null;
}
