import { describe, expect, test } from "bun:test";
import { parse, unparse } from "./parser";
import { step, normalize, isValue } from "./reducer";

const reduce = (src: string) => unparse(normalize(parse(src)[0]).expr);
const once = (src: string) => unparse(step(parse(src)[0]).expr);

describe("reducer", () => {
  test("one redex per step (leftmost-innermost)", () => {
    expect(once("(+ (+ 1 2) (+ 3 4))")).toBe("(+ 3 (+ 3 4))");
  });

  test("the worked trace resolves to an action term", () => {
    const r = normalize(parse("(move Self (if (= Pasture Pasture) Barn Pasture))")[0]);
    expect(unparse(r.expr)).toBe("(move Self Barn)");
    expect(r.steps).toBe(2); // reduce the =, then collapse the if
  });

  test("an action term is a value (normal form)", () => {
    expect(step(parse("(move Self Barn)")[0]).done).toBe(true);
    expect(isValue(parse("Pasture")[0])).toBe(true);
    expect(isValue(parse("(= 1 1)")[0])).toBe(false);
  });

  test("if is lazy — the untaken branch is never evaluated", () => {
    // (+ Pasture Pasture) would throw if evaluated; it must not be.
    expect(reduce("(if true Pasture (+ Pasture Pasture))")).toBe("Pasture");
    expect(reduce("(if false (+ Pasture Pasture) Barn)")).toBe("Barn");
  });

  test("and / or short-circuit", () => {
    expect(reduce("(and false (+ x x))")).toBe("false");
    expect(reduce("(or true (+ x x))")).toBe("true");
    expect(reduce("(and true Pasture)")).toBe("Pasture");
  });

  test("name equality is lenient (symbol vs string)", () => {
    expect(reduce('(= Pasture "Pasture")')).toBe("true");
    expect(reduce("(= Pasture Barn)")).toBe("false");
  });

  test("arithmetic", () => {
    expect(reduce("(+ 1 2 3)")).toBe("6");
    expect(reduce("(- 10 1 2)")).toBe("7");
  });

  test("nested decision normalizes to a single action", () => {
    const src = "(move Self (if (and true (= Wolf-at Pasture)) Barn Pasture))";
    // Wolf-at is an inert name here; (= Wolf-at Pasture) is false → Pasture branch
    expect(reduce(src)).toBe("(move Self Pasture)");
  });

  test("list operations", () => {
    expect(reduce("(first (list Pasture Barn Meadow))")).toBe("Pasture");
    expect(reduce("(rest (list Pasture Barn))")).toBe("(Barn)");
    expect(reduce("(count (list a b c))")).toBe("3");
    expect(reduce("(empty? (list))")).toBe("true");
    expect(reduce("(member? Barn (list Pasture Barn))")).toBe("true");
    expect(reduce("(member? Cave (list Pasture Barn))")).toBe("false");
    expect(reduce("(without (list Pasture Barn Meadow) Barn)")).toBe("(Pasture Meadow)");
  });

  test("pick the first safe location (the evasion idiom)", () => {
    // safe = all locations except where the wolf is believed to be
    const src =
      "(move Self (first (without (list Pasture Barn Meadow) Pasture)))";
    expect(reduce(src)).toBe("(move Self Barn)");
  });
});
