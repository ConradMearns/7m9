import { describe, expect, test } from "bun:test";
import { parse, unparse, isSExpr, type SExpr } from "./parser";
import { World } from "./ecs";
import { Interpreter } from "./interpreter";

describe("parser", () => {
  test("reads atoms", () => {
    expect(parse("42")).toEqual([{ kind: "number", value: 42 }]);
    expect(parse("Wolf")).toEqual([{ kind: "symbol", name: "Wolf" }]);
    expect(parse('"a b"')).toEqual([{ kind: "string", value: "a b" }]);
  });

  test("reads nested lists", () => {
    const [form] = parse("(move Wolf (location Forest))");
    expect(unparse(form)).toBe("(move Wolf (location Forest))");
  });

  test("reads multiple top-level forms with messy whitespace", () => {
    expect(parse("  (entity Wolf)\n(entity  Bear) ").length).toBe(2);
  });

  test("throws on unbalanced parens", () => {
    expect(() => parse("(move Wolf")).toThrow();
  });

  test("skips ; line comments", () => {
    expect(parse("; a note\n(entity Wolf) ; trailing\n").length).toBe(1);
    expect(parse("; only a comment").length).toBe(0);
  });
});

describe("interpreter + ecs", () => {
  test("the headline example works", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(location Forest) (entity Wolf) (move Wolf Forest)");
    expect(lisp.run("(where Wolf)")).toEqual(["Forest"]);
  });

  test("move rejects non-location destinations", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(entity Wolf) (entity Bear)");
    expect(() => lisp.run("(move Wolf Bear)")).toThrow(/not a location/);
  });

  test("calls nest: create-and-move in one form", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(location Forest)");
    lisp.run("(move (entity Bear) Forest)");
    expect(lisp.run("(where Bear)")).toEqual(["Forest"]);
  });

  test("generic components via set/get", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(entity Wolf) (set Wolf hp 10)");
    expect(lisp.run("(get Wolf hp)")).toEqual([10]);
  });

  test("destroy removes the entity", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(entity Wolf)");
    lisp.run("(destroy Wolf)");
    expect(() => lisp.run("(where Wolf)")).toThrow(/no entity/);
  });
});

describe("quote & code-as-data", () => {
  test("reader sugar expands and round-trips", () => {
    expect(unparse(parse("'x")[0])).toBe("'x");
    expect(unparse(parse("`(a ,b)")[0])).toBe("`(a ,b)");
    expect(parse("'(entity Wolf)")[0]).toEqual({
      kind: "list",
      items: [
        { kind: "symbol", name: "quote" },
        {
          kind: "list",
          items: [
            { kind: "symbol", name: "entity" },
            { kind: "symbol", name: "Wolf" },
          ],
        },
      ],
    });
  });

  test("quote yields data; eval runs it", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    const [code] = lisp.run("'(entity Wolf)");
    expect(isSExpr(code)).toBe(true);
    expect(w.query("Name").length).toBe(0); // not created yet
    lisp.run("(eval '(entity Wolf))");
    expect(w.query("Name").length).toBe(1);
  });

  test("code can be stored on a component and evaluated later", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(location Forest) (entity Wolf)");
    lisp.run("(set Wolf plan '(move Wolf Forest))");
    expect(lisp.run("(where Wolf)")).toEqual([null]);
    lisp.run("(eval (get Wolf plan))");
    expect(lisp.run("(where Wolf)")).toEqual(["Forest"]);
  });

  test("quasiquote snapshots an unquoted value into the data", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(location Forest) (entity Wolf) (move Wolf Forest)");
    const [thought] = lisp.run("`(go-to ,(where Wolf))");
    expect(isSExpr(thought)).toBe(true);
    expect(unparse(thought as SExpr)).toBe('(go-to "Forest")');
  });

  test("unquote outside quasiquote is an error", () => {
    const lisp = new Interpreter(new World());
    expect(() => lisp.run(",x")).toThrow(/quasiquote/);
  });
});
