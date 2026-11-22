export function riskPlan(p) {
  const o = {
    direction: 'long', entry: 0, atr: 0, equity: 0, riskPct: 1, stopK: 2, tpK: 3,
    leverage: 1, feeRate: 0.001, instrument: 'spot', fundingRate8h: 0, borrowDaily: 0, holdHours: 24, ...p,
  };
  const d = o.direction === 'short' ? -1 : 1;
  const stop = o.entry - d * o.stopK * o.atr;
  const tp = o.entry + d * o.tpK * o.atr;
  const stopDist = o.stopK * o.atr;
  const days = o.holdHours / 24;
  let carryFrac;
  if (o.instrument === 'swap') carryFrac = d * o.fundingRate8h * (o.holdHours / 8);
  else carryFrac = Math.max(0, 1 - 1 / o.leverage) * o.borrowDaily * days;
  const perUnitLoss = stopDist + o.entry * o.feeRate + stop * o.feeRate + o.entry * carryFrac;
  const riskAmount = (o.equity * o.riskPct) / 100;
  let qty = perUnitLoss > 0 ? riskAmount / perUnitLoss : 0;
  const maxQty = (o.equity * o.leverage) / o.entry;
  const capped = qty > maxQty;
  if (capped) qty = maxQty;
  const notional = qty * o.entry;
  const feesAtTp = qty * (o.entry + tp) * o.feeRate;
  const feesAtStop = qty * (o.entry + stop) * o.feeRate;
  const carry = notional * carryFrac;
  const rewardNet = qty * o.tpK * o.atr - feesAtTp - carry;
  const lossNet = qty * stopDist + feesAtStop + carry;
  const f = o.feeRate;
  const breakeven = d === 1 ? (o.entry * (1 + f)) / (1 - f) + (o.entry * carryFrac) : (o.entry * (1 - f)) / (1 + f) - (o.entry * carryFrac);
  const liqDist = o.leverage > 1 ? o.entry / o.leverage : Infinity;
  return {
    stop, tp, qty, notional, margin: notional / o.leverage, capped,
    feesAtTp, feesAtStop, carry, rewardNet, lossNet,
    rrNet: lossNet > 0 ? rewardNet / lossNet : NaN,
    breakeven, stopTooCloseToLiq: o.leverage > 1 && stopDist > 0.8 * liqDist,
  };
}
