import { formatNumber } from './formulas.js';

export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
}

export function descriptiveStats(data: number[]): DescriptiveStats | null {
  const values = data.filter(Number.isFinite);
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
    : 0;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { n: values.length, mean, median, sd: Math.sqrt(variance), min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

export interface RegressionData {
  x: number[];
  y: number[];
}

export interface RegressionResult {
  degree: 1 | 2;
  coefficients: number[];
  r2: number;
  equation: string;
  latex: string;
  predict: (x: number) => number;
}

function rSquared(y: number[], predicted: number[]): number {
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  const sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const sse = y.reduce((s, v, i) => s + (v - predicted[i]!) ** 2, 0);
  if (sst === 0) return sse === 0 ? 1 : 0;
  return 1 - sse / sst;
}

function solve3x3(a: number[][], b: number[]): [number, number, number] | null {
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const pivotRow = m[col]!;
    const p = pivotRow[col]!;
    for (let j = col; j < 4; j++) pivotRow[j] = pivotRow[j]! / p;
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const current = m[row]!;
      const f = current[col]!;
      for (let j = col; j < 4; j++) current[j] = current[j]! - f * pivotRow[j]!;
    }
  }
  return [m[0]![3]!, m[1]![3]!, m[2]![3]!];
}

function latexEquation(coefficients: number[], degree: 1 | 2): string {
  if (degree === 1) {
    return `y = ${formatNumber(coefficients[0]!)}x ${coefficients[1]! < 0 ? '-' : '+'} ${formatNumber(Math.abs(coefficients[1]!))}`;
  }
  return `y = ${formatNumber(coefficients[0]!)}x^2 ${coefficients[1]! < 0 ? '-' : '+'} ${formatNumber(Math.abs(coefficients[1]!))}x ${coefficients[2]! < 0 ? '-' : '+'} ${formatNumber(Math.abs(coefficients[2]!))}`;
}

export function linearRegression(data: RegressionData): RegressionResult | null {
  const pairs = data.x.map((x, i) => [x, data.y[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 2) return null;
  const n = pairs.length;
  const sx = pairs.reduce((s, [x]) => s + x, 0);
  const sy = pairs.reduce((s, [, y]) => s + y!, 0);
  const sxx = pairs.reduce((s, [x]) => s + x * x, 0);
  const sxy = pairs.reduce((s, [x, y]) => s + x * y!, 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const a = (n * sxy - sx * sy) / den;
  const b = (sy - a * sx) / n;
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y!);
  const predicted = xs.map((x) => a * x + b);
  const equation = `y = ${formatNumber(a)}x ${b < 0 ? '-' : '+'} ${formatNumber(Math.abs(b))}`;
  return { degree: 1, coefficients: [a, b], r2: rSquared(ys, predicted), equation, latex: latexEquation([a, b], 1), predict: (x) => a * x + b };
}

export function quadraticRegression(data: RegressionData): RegressionResult | null {
  const pairs = data.x.map((x, i) => [x, data.y[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const s1 = pairs.reduce((s, [x]) => s + x, 0);
  const s2 = pairs.reduce((s, [x]) => s + x ** 2, 0);
  const s3 = pairs.reduce((s, [x]) => s + x ** 3, 0);
  const s4 = pairs.reduce((s, [x]) => s + x ** 4, 0);
  const sy = pairs.reduce((s, [, y]) => s + y!, 0);
  const sxy = pairs.reduce((s, [x, y]) => s + x * y!, 0);
  const sx2y = pairs.reduce((s, [x, y]) => s + x * x * y!, 0);
  const coefficients = solve3x3([[s4, s3, s2], [s3, s2, s1], [s2, s1, n]], [sx2y, sxy, sy]);
  if (!coefficients) return null;
  const [a, b, c] = coefficients;
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y!);
  const predicted = xs.map((x) => a * x * x + b * x + c);
  const equation = `y = ${formatNumber(a)}x² ${b < 0 ? '-' : '+'} ${formatNumber(Math.abs(b))}x ${c < 0 ? '-' : '+'} ${formatNumber(Math.abs(c))}`;
  return { degree: 2, coefficients, r2: rSquared(ys, predicted), equation, latex: latexEquation(coefficients, 2), predict: (x) => a * x * x + b * x + c };
}
