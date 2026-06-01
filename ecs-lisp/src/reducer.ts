// ─────────────────────────────────────────────────────────────────────────
// Step interpreter — a pure, pausable AST reducer
//
// This is how entities "think". A thought is an s-expression; `step` performs
// exactly ONE reduction (one redex → its result), rewriting the term. Resolving
// a thought therefore takes as many ticks as it has redexes — bigger reasoning
// literally takes longer. Each intermediate term is itself a valid s-expression,
// so the in-progress thought can be displayed and saved.
//
// The reducer is PURE: no world access, no environment. Perception is baked into
// the thought as data before reduction begins (see the Sense platform), so a
// thought is self-contained. Thinking never mutates anything — it reduces to an
// *action term* like (move Self Barn), which the scheduler then applies.
//
// What reduces vs. what is a value:
//   - atoms (number/string/symbol) are values
//   - (if c t e), (and ...), (or ...) reduce lazily (untaken branch is untouched)
//   - (<pure-fn> args...) reduces once all args are values  (=, not, +, -, *)
//   - any OTHER list head is an inert action/data term — a value once its args
//     are normalized. This is how a thought *produces* an action for the scheduler.
// ─────────────────────────────────────────────────────────────────────────

import { unparse, type SExpr } from "./parser";

const TRUE: SExpr = { kind: "symbol", name: "true" };
const FALSE: SExpr = { kind: "symbol", name: "false" };
const NIL: SExpr = { kind: "symbol", name: "nil" };

const bool = (b: boolean): SExpr => (b ? TRUE : FALSE);

/** Lisp truthiness: only `false` and `nil` are falsy. */
function truthy(e: SExpr): boolean {
  return !(e.kind === "symbol" && (e.name === "false" || e.name === "nil"));
}

/** A symbol or string both denote a name; numbers compare numerically. */
function equalValues(a: SExpr, b: SExpr): boolean {
  if (a.kind === "number" || b.kind === "number") {
    return a.kind === "number" && b.kind === "number" && a.value === b.value;
  }
  if (a.kind === "list" && b.kind === "list") {
    return (
      a.items.length === b.items.length &&
      a.items.every((x, i) => equalValues(x, b.items[i]))
    );
  }
  const an = a.kind === "symbol" ? a.name : a.kind === "string" ? a.value : null;
  const bn = b.kind === "symbol" ? b.name : b.kind === "string" ? b.value : null;
  return an !== null && an === bn;
}

function asNumber(e: SExpr): number {
  if (e.kind !== "number") {
    throw new Error(`expected a number, got ${unparse(e)}`);
  }
  return e.value;
}

const num = (value: number): SExpr => ({ kind: "number", value });
const list = (items: SExpr[]): SExpr => ({ kind: "list", items });

/** A list value is an inert (non-operator-headed) list. */
function asList(e: SExpr, who: string): SExpr[] {
  if (e.kind !== "list") throw new Error(`${who}: not a list: ${unparse(e)}`);
  return e.items;
}

/** Strict pure functions: applied only once every argument is a value. */
const PURE_FNS: Record<string, (args: SExpr[]) => SExpr> = {
  "=": (args) => bool(args.every((a) => equalValues(a, args[0]))),
  not: (args) => bool(!truthy(args[0] ?? NIL)),
  "+": (args) => num(args.reduce((s, a) => s + asNumber(a), 0)),
  "*": (args) => num(args.reduce((s, a) => s * asNumber(a), 1)),
  "-": (args) =>
    args.length === 0
      ? num(0)
      : args.length === 1
        ? num(-asNumber(args[0]))
        : num(args.slice(1).reduce((s, a) => s - asNumber(a), asNumber(args[0]))),

  // list operations (operate on inert list values)
  list: (args) => list(args),
  first: (args) => asList(args[0], "first")[0] ?? NIL,
  rest: (args) => list(asList(args[0], "rest").slice(1)),
  count: (args) => num(asList(args[0], "count").length),
  "empty?": (args) => bool(asList(args[0], "empty?").length === 0),
  // (member? x list) -> is x in the list?
  "member?": (args) =>
    bool(asList(args[1], "member?").some((it) => equalValues(it, args[0]))),
  // (without list x) -> list with every element equal to x removed
  without: (args) =>
    list(asList(args[0], "without").filter((it) => !equalValues(it, args[1]))),
};

const LAZY = new Set(["if", "and", "or"]);

/** Is this term irreducible (a value / normal form)? */
export function isValue(e: SExpr): boolean {
  if (e.kind !== "list") return true;
  if (e.items.length === 0) return true; // () behaves like nil
  const head = e.items[0];
  if (head.kind === "symbol") {
    if (head.name === "quote") return true; // quoted data is inert
    if (LAZY.has(head.name)) return false;
    if (PURE_FNS[head.name]) return false;
  }
  // Inert head (action/data term): a value once every part is a value.
  return e.items.every(isValue);
}

const withItem = (items: SExpr[], i: number, v: SExpr): SExpr => ({
  kind: "list",
  items: items.map((x, j) => (j === i ? v : x)),
});

export interface StepResult {
  /** The term after one reduction, or unchanged if already a value. */
  expr: SExpr;
  /** True when `expr` is in normal form (nothing left to reduce). */
  done: boolean;
}

/** Perform exactly one reduction (leftmost-innermost / applicative order). */
export function step(e: SExpr): StepResult {
  if (isValue(e)) return { expr: e, done: true };
  // e must be a reducible list here.
  const items = (e as Extract<SExpr, { kind: "list" }>).items;
  const head = items[0];

  if (head.kind === "symbol") {
    if (head.name === "if") {
      const cond = items[1];
      if (cond === undefined) throw new Error("if: missing condition");
      if (!isValue(cond)) {
        return { expr: withItem(items, 1, step(cond).expr), done: false };
      }
      return { expr: (truthy(cond) ? items[2] : items[3]) ?? NIL, done: false };
    }

    if (head.name === "and" || head.name === "or") {
      return stepAndOr(head.name, items);
    }

    const fn = PURE_FNS[head.name];
    if (fn) {
      for (let i = 1; i < items.length; i++) {
        if (!isValue(items[i])) {
          return { expr: withItem(items, i, step(items[i]).expr), done: false };
        }
      }
      return { expr: fn(items.slice(1)), done: false };
    }
  }

  // Inert head: normalize the leftmost non-value sub-term.
  for (let i = 0; i < items.length; i++) {
    if (!isValue(items[i])) {
      return { expr: withItem(items, i, step(items[i]).expr), done: false };
    }
  }
  return { expr: e, done: true }; // unreachable: isValue would have been true
}

/** Lazy, short-circuiting `and` / `or`, one reduction per call. */
function stepAndOr(op: "and" | "or", items: SExpr[]): StepResult {
  for (let i = 1; i < items.length; i++) {
    const operand = items[i];
    if (!isValue(operand)) {
      return { expr: withItem(items, i, step(operand).expr), done: false };
    }
    const t = truthy(operand);
    if (op === "and" && !t) return { expr: FALSE, done: false };
    if (op === "or" && t) return { expr: operand, done: false };
  }
  // and: all truthy → last operand (or true if none). or: none truthy → false.
  if (op === "and") {
    return { expr: items.length > 1 ? items[items.length - 1] : TRUE, done: false };
  }
  return { expr: FALSE, done: false };
}

export interface NormalizeResult {
  expr: SExpr;
  /** Number of reductions performed. */
  steps: number;
  /** False only if the step cap was hit before reaching normal form. */
  done: boolean;
}

/** Reduce to normal form (or until `maxSteps`), counting reductions. */
export function normalize(expr: SExpr, maxSteps = 10_000): NormalizeResult {
  let current = expr;
  for (let steps = 0; steps < maxSteps; steps++) {
    const r = step(current);
    if (r.done) return { expr: current, steps, done: true };
    current = r.expr;
  }
  return { expr: current, steps: maxSteps, done: false };
}
