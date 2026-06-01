// ─────────────────────────────────────────────────────────────────────────
// LISP reader, built from parser combinators
//
// A parser is just a function: given the input + a position, it either
// succeeds (producing a value and a new position) or fails (with what it
// expected and where). Small parsers are combined into bigger ones — that is
// the whole "combinator" idea. At the bottom we have `regex`; at the top we
// have `expr`, which can parse a complete nested s-expression.
// ─────────────────────────────────────────────────────────────────────────

export type SExpr =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "symbol"; name: string }
  | { kind: "list"; items: SExpr[] };

interface PState {
  src: string;
  pos: number;
}

type POk<T> = { ok: true; value: T; next: PState };
type PFail = { ok: false; expected: string; pos: number };
type PResult<T> = POk<T> | PFail;

export type Parser<T> = (s: PState) => PResult<T>;

const succeed = <T>(value: T, next: PState): POk<T> => ({
  ok: true,
  value,
  next,
});
const failWith = (expected: string, pos: number): PFail => ({
  ok: false,
  expected,
  pos,
});

// ── primitive ──────────────────────────────────────────────────────────────

/** Match a regex anchored at the current position. */
export const regex = (re: RegExp, label: string): Parser<string> => {
  const sticky = new RegExp(re.source, re.flags.replace(/[gy]/g, "") + "y");
  return (s) => {
    sticky.lastIndex = s.pos;
    const m = sticky.exec(s.src);
    if (!m) return failWith(label, s.pos);
    return succeed(m[0], { src: s.src, pos: s.pos + m[0].length });
  };
};

// ── combinators ──────────────────────────────────────────────────────────────

export const map =
  <A, B>(p: Parser<A>, f: (a: A) => B): Parser<B> =>
  (s) => {
    const r = p(s);
    return r.ok ? succeed(f(r.value), r.next) : r;
  };

/** Try each parser in turn; return the first success. */
export const alt =
  <T>(...ps: Parser<T>[]): Parser<T> =>
  (s) => {
    let furthest: PFail = failWith("nothing", s.pos);
    for (const p of ps) {
      const r = p(s);
      if (r.ok) return r;
      if (r.pos >= furthest.pos) furthest = r;
    }
    return furthest;
  };

/** Zero or more repetitions. Always succeeds. */
export const many =
  <T>(p: Parser<T>) =>
  (s: PState): POk<T[]> => {
    const out: T[] = [];
    let cur = s;
    for (;;) {
      const r = p(cur);
      if (!r.ok) break;
      out.push(r.value);
      cur = r.next;
    }
    return succeed(out, cur);
  };

/** Defer construction so a parser can refer to itself (recursive grammars). */
export const lazy =
  <T>(make: () => Parser<T>): Parser<T> =>
  (s) =>
    make()(s);

// ── lisp grammar ──────────────────────────────────────────────────────────────

// Skips runs of whitespace and `;` line comments between tokens.
const ws = regex(/(?:\s+|;[^\n]*)*/, "whitespace");

/** Skip leading whitespace before applying `p`. */
const lexeme =
  <T>(p: Parser<T>): Parser<T> =>
  (s) => {
    const skipped = ws(s);
    return p(skipped.ok ? skipped.next : s);
  };

const numberP = map(
  lexeme(regex(/-?\d+(?:\.\d+)?/, "number")),
  (t): SExpr => ({ kind: "number", value: Number(t) }),
);

const stringP = map(
  lexeme(regex(/"(?:[^"\\]|\\.)*"/, "string")),
  (t): SExpr => ({ kind: "string", value: JSON.parse(t) as string }),
);

// A symbol is anything that is not whitespace, a paren, or a quote.
const symbolP = map(
  lexeme(regex(/[^\s()"]+/, "symbol")),
  (t): SExpr => ({ kind: "symbol", name: t }),
);

const lparen = lexeme(regex(/\(/, "("));
const rparen = lexeme(regex(/\)/, ")"));

const listP: Parser<SExpr> = (s) => {
  const open = lparen(s);
  if (!open.ok) return open;
  const inner = many(expr)(open.next);
  const close = rparen(inner.next);
  if (!close.ok) return close;
  return succeed({ kind: "list", items: inner.value }, close.next);
};

// Order matters: numbers before symbols (a symbol would also swallow digits).
const expr: Parser<SExpr> = lazy(() => alt(numberP, stringP, listP, symbolP));

/**
 * Parse a whole program: zero or more top-level s-expressions.
 * Throws on leftover/unparseable input so the UI can show a clear error.
 */
export function parse(src: string): SExpr[] {
  const result = many(expr)({ src, pos: 0 }); // `many` always succeeds
  const tail = ws(result.next);
  const endPos = tail.ok ? tail.next.pos : result.next.pos;
  if (endPos < src.length) {
    const snippet = src.slice(endPos, endPos + 24);
    throw new Error(`Parse error at ${endPos}: unexpected "${snippet}"`);
  }
  return result.value;
}

/** Render an s-expression back to text (useful for echoing / debugging). */
export function unparse(e: SExpr): string {
  switch (e.kind) {
    case "number":
      return String(e.value);
    case "string":
      return JSON.stringify(e.value);
    case "symbol":
      return e.name;
    case "list":
      return `(${e.items.map(unparse).join(" ")})`;
  }
}
