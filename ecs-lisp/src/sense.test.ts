import { describe, expect, test } from "bun:test";
import { World } from "./ecs";
import { Interpreter } from "./interpreter";
import { sense } from "./sense";
import { BELIEFS, NAME } from "./components";

const wolfOf = (w: World) =>
  w.query(NAME).find((id) => w.get(id, NAME) === "Wolf")!;

describe("sense platform", () => {
  test("belief diverges from truth until re-sensed", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(location Pasture) (location Barn) (entity Wolf) (entity Sheep)");
    lisp.run("(move Sheep Pasture)");

    lisp.run("(sense Wolf)"); // Wolf now believes Sheep @ Pasture
    lisp.run("(move Sheep Barn)"); // truth changes; Wolf hasn't looked again

    expect(lisp.run("(recall Wolf Sheep)")).toEqual(["Pasture"]); // stale belief
    expect(lisp.run("(where Sheep)")).toEqual(["Barn"]); // truth

    lisp.run("(sense Wolf)"); // re-perceive
    expect(lisp.run("(recall Wolf Sheep)")).toEqual(["Barn"]);
  });

  test("recall is null without a belief", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(entity Wolf) (entity Sheep)");
    expect(lisp.run("(recall Wolf Sheep)")).toEqual([null]);
  });

  test("nested beliefs exist and terminate at the depth bound", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(location Pasture) (entity Wolf) (entity Sheep)");
    lisp.run("(move Wolf Pasture) (move Sheep Pasture)");

    // depth 3: top belief-world → entities w/ beliefs → entities w/ beliefs → leaves
    const beliefs = sense(w, wolfOf(w), 3);

    let level = beliefs;
    let hops = 0;
    for (;;) {
      const nested = level.all().find((id) => level.has(id, BELIEFS));
      if (nested === undefined) break;
      level = level.get(nested, BELIEFS) as World;
      hops += 1;
      if (hops > 8) break; // guard against runaway (would mean unbounded)
    }
    expect(hops).toBe(2); // depth 3 → two further levels carry beliefs, then stop
  });

  test("introspect renders a nested theory-of-mind tree", () => {
    const w = new World();
    const lisp = new Interpreter(w);
    lisp.run("(location Pasture) (location Barn) (entity Wolf) (entity Sheep)");
    lisp.run("(move Wolf Barn) (move Sheep Pasture)");
    lisp.run("(sense Wolf 3)");
    const [tree] = lisp.run("(introspect Wolf)");
    const text = String(tree);
    expect(text).toContain("Wolf believes:");
    expect(text).toContain("Sheep @ Pasture");
    expect(text).toContain("Sheep believes:"); // it nests
    expect(text).not.toContain("Pasture believes"); // places are omitted
    // deeper indentation exists (nested levels)
    expect(text.split("\n").some((l) => l.startsWith("        "))).toBe(true);
  });
});
