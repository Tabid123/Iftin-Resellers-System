export const calculateEvoucherProfit = (
  sellingPrice: number,
  costPrice: number,
  evoucherRate: number,
): number => {
  const selling = Number(sellingPrice || 0);
  const cost = Number(costPrice || 0);
  const rate = Number(evoucherRate || 0);
  return selling * (1 + rate) - cost;
};

export const calculateUsdProfit = (
  sellingPrice: number,
  costPrice: number,
  evoucherRate: number,
): number => {
  const rate = Number(evoucherRate || 0);
  const denominator = 1 + rate;
  if (denominator <= 0) return 0;
  return calculateEvoucherProfit(sellingPrice, costPrice, rate) / denominator;
};

export const calculateRevenue = (sellingPrice: number): number =>
  Number(sellingPrice || 0);

const DIRECT_FLOW_RE = /^\*(870|866|101|212)(\*|#)/;

/** *870 / *866 / *101 / *212 waa flows: faa'idadu waa Selling − Cost. */
export const isDirectFlowCode = (value?: string | null): boolean =>
  DIRECT_FLOW_RE.test(String(value || '').split('|')[0].trim());

export const calculateOrderProfit = (
  sellingPrice: number,
  costPrice: number,
  evoucherRate: number,
  isDirectFlow: boolean,
): number =>
  isDirectFlow
    ? Number(sellingPrice || 0) - Number(costPrice || 0)
    : calculateUsdProfit(sellingPrice, costPrice, evoucherRate);

/**
 * Historical orders may have cost_price=0 because older payment paths did not
 * persist the package cost. Prefer the stored order snapshot when present and
 * otherwise fall back to the package configuration cost.
 */
export const effectiveOrderCost = (
  orderCostPrice: number | string | null | undefined,
  packageCostPrice?: number | string | null,
): number => {
  const orderCost = Number(orderCostPrice || 0);
  if (orderCost > 0) return orderCost;
  const packageCost = Number(packageCostPrice || 0);
  return packageCost > 0 ? packageCost : 0;
};
