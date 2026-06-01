import { describe, expect, test } from "bun:test";
import { World } from "./ecs";
import { Interpreter } from "./interpreter";

const setup = () => {
  const w = new World();
  const lisp = new Interpreter(w);
  lisp.run("(location Pasture) (location Barn) (entity Wolf) (entity Sheep)");
  return { w, lisp };
};

describe("agent loop (sense → think → act)", () => {
  test("clock advances; run does many ticks", () => {
    const { lisp } = setup();
    expect(lisp.run("(clock)")).toEqual([0]);
    expect(lisp.run("(tick)")).toEqual([1]);
    expect(lisp.run("(run 5)")).toEqual([6]);
  });

  test("a Mind drives a move via sensed beliefs", () => {
    const { lisp } = setup();
    lisp.run("(move Wolf Barn) (move Sheep Pasture)");
    lisp.run("(mind Wolf '(move Self ,(recall Self Sheep)))");
    lisp.run("(tick)"); // sense Sheep@Pasture, bake, act
    expect(lisp.run("(where Wolf)")).toEqual(["Pasture"]);
  });

  test("a multi-step thought acts a tick later (the stagger)", () => {
    const { lisp } = setup();
    lisp.run("(move Wolf Barn)");
    // two redexes (the = then the if) → not done after one step
    lisp.run("(mind Wolf '(if (= 1 1) (move Self Pasture) (stay)))");
    lisp.run("(tick)");
    expect(lisp.run("(where Wolf)")).toEqual(["Barn"]); // still thinking
    lisp.run("(tick)");
    expect(lisp.run("(where Wolf)")).toEqual(["Pasture"]); // acted now
  });

  test("acts on the belief snapshot taken when thinking began (stale)", () => {
    const { lisp } = setup();
    lisp.run("(move Wolf Barn) (move Sheep Pasture)");
    // padded to 2 redexes so the decision spans two ticks
    lisp.run("(mind Wolf '(move Self (if (= 1 1) ,(recall Self Sheep) ,(recall Self Sheep))))");
    lisp.run("(tick)"); // bakes Sheep@Pasture; one step; not yet acted
    expect(lisp.run("(where Wolf)")).toEqual(["Barn"]);
    lisp.run("(move Sheep Barn)"); // truth changes mid-thought
    lisp.run("(tick)"); // collapses + acts on the OLD snapshot
    expect(lisp.run("(where Wolf)")).toEqual(["Pasture"]); // sheep's old spot, not Barn
    expect(lisp.run("(where Sheep)")).toEqual(["Barn"]);
  });

  test("entities without a Mind are inert across ticks", () => {
    const { lisp } = setup();
    lisp.run("(move Sheep Pasture)");
    lisp.run("(run 10)");
    expect(lisp.run("(where Sheep)")).toEqual(["Pasture"]);
  });
});
