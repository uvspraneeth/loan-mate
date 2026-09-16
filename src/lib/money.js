// Money helpers — round to nearest rupee to avoid floating-point drift.
// All stored amounts are whole rupees (numbers). Calculations route through roundMoney.

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function roundRupee(n) {
  return Math.round(Number(n) || 0);
}

// Indian numbering: ₹1,00,000
export function formatINR(amount, { withSymbol = true } = {}) {
  const n = roundMoney(amount);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const fixed = abs.toFixed(0);
  const last3 = fixed.slice(-3);
  const rest = fixed.slice(0, -3);
  const withCommas = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${sign}${withSymbol ? '₹' : ''}${withCommas}`;
}

export function formatINRDecimal(amount, { withSymbol = true } = {}) {
  const n = roundMoney(amount);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const withCommas = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${sign}${withSymbol ? '₹' : ''}${withCommas}.${decPart}`;
}

export function parseAmount(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value || '').replace(/[₹,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}