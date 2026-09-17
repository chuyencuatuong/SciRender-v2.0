import type { Diagnostic, InlineNode, TableNode } from '@scirender/ast';

export type TableFormulaError =
  | 'INVALID_FORMULA'
  | 'REF_ERROR'
  | 'DIV_ZERO'
  | 'CIRCULAR_REF'
  | 'VALUE_ERROR'
  | 'FUNCTION_ERROR';

export interface CellEvaluation {
  value: number | null;
  display: string;
  formula: string | null;
  error: TableFormulaError | null;
}

export interface EvaluatedGrid {
  header: string[];
  values: string[][];
  evaluations: CellEvaluation[][];
  errors: Array<{ row: number; col: number; code: TableFormulaError; formula: string }>;
}

export interface GridInput {
  header: string[];
  rows: string[][];
}

interface Token {
  kind: 'number' | 'ref' | 'identifier' | 'operator' | 'lparen' | 'rparen' | 'colon' | 'comma';
  text: string;
}

interface EvalContext {
  rows: string[][];
  cache: Map<string, CellEvaluation>;
  stack: Set<string>;
}

const CELL_REF = /^[A-Z]{1,3}[1-9]\d*$/i;
const NUMERIC = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/;
const RANGE_REF = /^([A-Z]{1,3})([1-9]\d*):([A-Z]{1,3})([1-9]\d*)$/i;

export function plainCellText(children: InlineNode[]): string {
  return children
    .map((node) => inlineText(node))
    .join('')
    .trim();
}

function inlineText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'inlineCode':
      return node.value;
    case 'inlineMath':
      return `$${node.value}$`;
    case 'strong':
    case 'emphasis':
    case 'superscript':
    case 'subscript':
    case 'link':
      return node.children.map(inlineText).join('');
    case 'crossRef':
      return `@${node.label}`;
    case 'citation':
      return node.keys.map((k) => `[@${k}]`).join(', ');
    case 'footnoteRef':
      return `[^${node.label}]`;
    case 'break':
      return '\n';
    default:
      return '';
  }
}

export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (!NUMERIC.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '#NUM!';
  if (Object.is(value, -0)) return '0';
  const rounded = Number(value.toFixed(10));
  return Number.isFinite(rounded) ? String(rounded) : String(value);
}

function columnToIndex(column: string): number {
  let out = 0;
  for (const ch of column.toUpperCase()) out = out * 26 + ch.charCodeAt(0) - 64;
  return out - 1;
}

function indexToColumn(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cellKey(row: number, col: number): string {
  return `${indexToColumn(col)}${row + 1}`;
}

function tokeniseFormula(source: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      tokens.push({ kind: 'operator', text: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen', text: ch });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', text: ch });
      i++;
      continue;
    }
    if (ch === ':') {
      tokens.push({ kind: 'colon', text: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma', text: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      if (!m) return null;
      tokens.push({ kind: 'number', text: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
      if (!m) return null;
      const text = m[0];
      tokens.push({ kind: CELL_REF.test(text) ? 'ref' : 'identifier', text });
      i += text.length;
      continue;
    }
    return null;
  }
  return tokens;
}

class FormulaParser {
  private index = 0;

  constructor(private readonly tokens: Token[], private readonly context: EvalContext) {}

  parse(): CellEvaluation {
    try {
      const value = this.expression();
      if (this.peek()?.kind !== undefined) throw new FormulaException('INVALID_FORMULA');
      return { value, display: formatNumber(value), formula: null, error: null };
    } catch (error) {
      const code = error instanceof FormulaException ? error.code : 'INVALID_FORMULA';
      return { value: null, display: formatFormulaError(code), formula: null, error: code };
    }
  }

  private expression(): number {
    let value = this.term();
    while (this.matchOperator('+') || this.matchOperator('-')) {
      const op = this.previous()?.text;
      const rhs = this.term();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  private term(): number {
    let value = this.power();
    while (this.matchOperator('*') || this.matchOperator('/')) {
      const op = this.previous()?.text;
      const rhs = this.power();
      if (op === '/' && rhs === 0) throw new FormulaException('DIV_ZERO');
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  private power(): number {
    let value = this.unary();
    if (this.matchOperator('^')) value = value ** this.power();
    return value;
  }

  private unary(): number {
    if (this.matchOperator('+')) return this.unary();
    if (this.matchOperator('-')) return -this.unary();
    return this.primary();
  }

  private primary(): number {
    const token = this.peek();
    if (!token) throw new FormulaException('INVALID_FORMULA');
    if (token.kind === 'number') {
      this.index++;
      const value = Number(token.text);
      if (!Number.isFinite(value)) throw new FormulaException('VALUE_ERROR');
      return value;
    }
    if (token.kind === 'ref') {
      this.index++;
      if (this.peek()?.kind === 'colon') {
        this.index++;
        const end = this.consume('ref');
        return this.rangeAggregate(token.text, end.text, 'sum');
      }
      return this.resolveRef(token.text);
    }
    if (token.kind === 'identifier') {
      this.index++;
      const name = token.text.toUpperCase();
      if (!this.matchKind('lparen')) throw new FormulaException('FUNCTION_ERROR');
      const args: number[] = [];
      const ranges: number[] = [];
      if (!this.matchKind('rparen')) {
        do {
          const start = this.peek();
          if (start?.kind === 'ref' && this.tokens[this.index + 1]?.kind === 'colon') {
            this.index++;
            this.index++;
            const end = this.consume('ref');
            ranges.push(...this.collectRange(start.text, end.text));
          } else {
            args.push(this.expression());
          }
        } while (this.matchKind('comma'));
        this.consume('rparen');
      }
      return applyFunction(name, args, ranges);
    }
    if (this.matchKind('lparen')) {
      const value = this.expression();
      this.consume('rparen');
      return value;
    }
    throw new FormulaException('INVALID_FORMULA');
  }

  private rangeAggregate(start: string, end: string, functionName: string): number {
    return applyFunction(functionName.toUpperCase(), [], this.collectRange(start, end));
  }

  private collectRange(start: string, end: string): number[] {
    const a = parseRef(start);
    const b = parseRef(end);
    if (!a || !b) throw new FormulaException('REF_ERROR');
    const r0 = Math.min(a.row, b.row);
    const r1 = Math.max(a.row, b.row);
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    const out: number[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) out.push(this.resolveRefValue(r, c));
    }
    return out;
  }

  private resolveRef(ref: string): number {
    const parsed = parseRef(ref);
    if (!parsed) throw new FormulaException('REF_ERROR');
    return this.resolveRefValue(parsed.row, parsed.col);
  }

  private resolveRefValue(row: number, col: number): number {
    if (row < 0 || col < 0 || row >= this.context.rows.length || col >= Math.max(...this.context.rows.map((r) => r.length), 0)) {
      throw new FormulaException('REF_ERROR');
    }
    const key = cellKey(row, col);
    const result = evaluateCell(row, col, this.context);
    if (this.context.stack.has(key)) throw new FormulaException('CIRCULAR_REF');
    if (result.error || result.value == null) throw new FormulaException(result.error ?? 'VALUE_ERROR');
    return result.value;
  }

  private peek(): Token | undefined { return this.tokens[this.index]; }
  private previous(): Token | undefined { return this.tokens[this.index - 1]; }

  private matchOperator(op: string): boolean {
    const t = this.peek();
    if (t?.kind !== 'operator' || t.text !== op) return false;
    this.index++;
    return true;
  }

  private matchKind(kind: Token['kind']): boolean {
    if (this.peek()?.kind !== kind) return false;
    this.index++;
    return true;
  }

  private consume(kind: Token['kind']): Token {
    const token = this.peek();
    if (!token || token.kind !== kind) throw new FormulaException('INVALID_FORMULA');
    this.index++;
    return token;
  }
}


function formatFormulaError(code: TableFormulaError): string {
  switch (code) {
    case 'REF_ERROR': return '#REF!';
    case 'DIV_ZERO': return '#DIV/0!';
    case 'CIRCULAR_REF': return '#CIRC!';
    case 'VALUE_ERROR': return '#VALUE!';
    case 'FUNCTION_ERROR': return '#NAME?';
    default: return '#ERROR!';
  }
}

class FormulaException extends Error {
  constructor(readonly code: TableFormulaError) { super(code); }
}

function parseRef(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)([1-9]\d*)$/i.exec(ref);
  if (!m) return null;
  return { col: columnToIndex(m[1] as string), row: Number(m[2]) - 1 };
}

function applyFunction(name: string, args: number[], ranges: number[]): number {
  const values = [...args, ...ranges];
  if (!values.length || values.some((v) => !Number.isFinite(v))) throw new FormulaException('VALUE_ERROR');
  switch (name) {
    case 'SUM': return values.reduce((s, v) => s + v, 0);
    case 'AVERAGE': return values.reduce((s, v) => s + v, 0) / values.length;
    case 'MIN': return Math.min(...values);
    case 'MAX': return Math.max(...values);
    default: throw new FormulaException('FUNCTION_ERROR');
  }
}

function evaluateCell(row: number, col: number, context: EvalContext): CellEvaluation {
  const key = cellKey(row, col);
  const cached = context.cache.get(key);
  if (cached) return cached;
  if (context.stack.has(key)) {
    const circular: CellEvaluation = { value: null, display: formatFormulaError('CIRCULAR_REF'), formula: context.rows[row]?.[col]?.trim() ?? null, error: 'CIRCULAR_REF' };
    context.cache.set(key, circular);
    return circular;
  }

  const raw = context.rows[row]?.[col]?.trim() ?? '';
  const direct = parseNumber(raw);
  if (!raw.startsWith('=')) {
    const directResult: CellEvaluation = {
      value: direct,
      display: raw,
      formula: null,
      error: null,
    };
    context.cache.set(key, directResult);
    return directResult;
  }

  context.stack.add(key);
  const formula = raw.slice(1).trim();
  const tokens = tokeniseFormula(formula);
  let result: CellEvaluation;
  if (!tokens || !formula) {
    result = { value: null, display: '#INVALID!', formula: raw, error: 'INVALID_FORMULA' };
  } else {
    result = new FormulaParser(tokens, context).parse();
    result.formula = raw;
  }
  context.stack.delete(key);
  context.cache.set(key, result);
  return result;
}

export function evaluateGrid(input: GridInput): EvaluatedGrid {
  const rows = input.rows.map((r) => r.slice());
  const context: EvalContext = { rows, cache: new Map(), stack: new Set() };
  const evaluations = rows.map((row, r) => row.map((_, c) => evaluateCell(r, c, context)));
  const errors: EvaluatedGrid['errors'] = [];
  for (let r = 0; r < evaluations.length; r++) {
    for (let c = 0; c < evaluations[r]!.length; c++) {
      const e = evaluations[r]![c]!;
      if (e.error && e.formula) errors.push({ row: r, col: c, code: e.error, formula: e.formula });
    }
  }
  return {
    header: input.header.slice(),
    values: evaluations.map((row) => row.map((e) => (e.error ? e.display : e.display))),
    evaluations,
    errors,
  };
}

export function evaluateTable(node: TableNode): EvaluatedGrid {
  const header = node.header.map((c) => plainCellText(c.children));
  const rows = node.rows.map((row) => row.map((c) => (c.covered ? '' : plainCellText(c.children))));
  return evaluateGrid({ header, rows });
}

export function checkTable(node: TableNode): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!node.rows.length) {
    out.push({
      code: 'SR-T001',
      severity: 'warning',
      stage: 'validator',
      nodeId: node.id,
      message: 'Bảng chỉ có dòng tiêu đề, không có dữ liệu.',
      position: node.position,
    });
  }
  if (!node.caption.length) {
    out.push({
      code: 'SR-T002',
      severity: 'warning',
      stage: 'validator',
      nodeId: node.id,
      message: 'Bảng chưa có chú thích (caption).',
      hint: 'Thêm dòng ": Chú thích bảng {#tbl:ten}" ngay dưới bảng.',
      position: node.position,
    });
  }
  const widths = new Set(node.rows.map((r) => r.length));
  if (widths.size > 1) {
    out.push({
      code: 'SR-T003',
      severity: 'error',
      stage: 'validator',
      nodeId: node.id,
      message: 'Các dòng trong bảng có số ô không đồng nhất.',
      position: node.position,
    });
  }

  const evaluated = evaluateTable(node);
  for (const error of evaluated.errors) {
    const labels: Record<TableFormulaError, string> = {
      INVALID_FORMULA: 'Công thức không hợp lệ.',
      REF_ERROR: 'Công thức tham chiếu đến ô không tồn tại.',
      DIV_ZERO: 'Công thức có phép chia cho 0.',
      CIRCULAR_REF: 'Công thức chứa tham chiếu vòng.',
      VALUE_ERROR: 'Công thức nhận giá trị không hợp lệ.',
      FUNCTION_ERROR: 'Hàm trong công thức không được hỗ trợ.',
    };
    const codes: Record<TableFormulaError, string> = {
      INVALID_FORMULA: 'SR-T110',
      REF_ERROR: 'SR-T111',
      DIV_ZERO: 'SR-T112',
      CIRCULAR_REF: 'SR-T113',
      VALUE_ERROR: 'SR-T114',
      FUNCTION_ERROR: 'SR-T115',
    };
    out.push({
      code: codes[error.code],
      severity: 'error',
      stage: 'validator',
      nodeId: node.id,
      message: `${labels[error.code]} Ô ${indexToColumn(error.col)}${error.row + 1}: ${error.formula}`,
      hint: 'Hỗ trợ: +, -, *, /, ^, ngoặc và SUM/AVERAGE/MIN/MAX với dải ô.',
      position: node.position,
    });
  }
  return out;
}
