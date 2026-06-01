// ─────────────────────────────────────────────────────────────────────────
// Interpreter — bridges the LISP AST to the ECS world
//
// Evaluation rules:
//   number / string  -> themselves
//   symbol           -> its name as a string (a bare name literal)
//   (head a b ...)   -> look up the builtin `head`, evaluate the args,
//                       call it with the world
//
// Because symbols evaluate to their own name, `(move Wolf Forest)` passes the
// strings "Wolf" and "Forest" to `move`, which resolves them to entities.
// And because args are evaluated first, calls nest naturally:
//   (move (entity Bear) Forest)
// ─────────────────────────────────────────────────────────────────────────

import { World, type EntityId } from "./ecs";
import { isSExpr, parse, type SExpr } from "./parser";
import { isValue, normalize, step as reduceOnce } from "./reducer";
import { AT, BELIEFS, MIND, NAME, PLACE, THOUGHT } from "./components";
import { recall, sense } from "./sense";

/** Replace every bare `Self` symbol with the acting entity's name. */
function substSelf(node: SExpr, name: string): SExpr {
  if (node.kind === "symbol") {
    return node.name === "Self" ? { kind: "symbol", name } : node;
  }
  if (node.kind === "list") {
    return { kind: "list", items: node.items.map((n) => substSelf(n, name)) };
  }
  return node;
}

export type Value =
  | number
  | string
  | boolean
  | null
  | SExpr // quoted code-as-data
  | Value[]
  | { [key: string]: Value };

type Builtin = (args: Value[]) => Value;

/** Re-embed a runtime value as an s-expression literal (for quasiquote splicing). */
function valueToSExpr(v: Value): SExpr {
  if (isSExpr(v)) return v; // already code
  if (typeof v === "number") return { kind: "number", value: v };
  if (typeof v === "string") return { kind: "string", value: v };
  if (typeof v === "boolean") return { kind: "symbol", name: v ? "true" : "false" };
  if (v === null) return { kind: "symbol", name: "nil" };
  throw new Error(`cannot splice ${JSON.stringify(v)} into a quasiquote`);
}


export class Interpreter {
  readonly builtins: Record<string, Builtin>;
  /** Simulation clock — number of ticks elapsed. */
  clock = 0;

  constructor(public readonly world: World) {
    this.builtins = this.makeBuiltins();
  }

  /** Parse and evaluate a source string; returns one result per top-level form. */
  run(src: string): Value[] {
    return parse(src).map((form) => this.eval(form));
  }

  eval(expr: SExpr): Value {
    switch (expr.kind) {
      case "number":
        return expr.value;
      case "string":
        return expr.value;
      case "symbol":
        return expr.name;
      case "list": {
        if (expr.items.length === 0) return null;
        const head = expr.items[0];
        if (head.kind !== "symbol") {
          throw new Error("the first element of a list must be a command name");
        }
        // Special forms control whether/how their arguments are evaluated.
        switch (head.name) {
          case "quote":
            return expr.items[1] ?? null; // the AST itself, unevaluated
          case "quasiquote":
            return this.quasi(expr.items[1]);
          case "unquote":
            throw new Error("unquote used outside of a quasiquote");
        }
        const fn = this.builtins[head.name];
        if (!fn) throw new Error(`unknown command: "${head.name}"`);
        const args = expr.items.slice(1).map((a) => this.eval(a));
        return fn(args);
      }
    }
  }

  /**
   * Build code-as-data from a quasiquote template: everything is literal data
   * except (unquote e), where `e` is evaluated now and spliced back in. This is
   * how an entity snapshots a current belief into a thought it resolves later.
   */
  private quasi(node: SExpr | undefined): SExpr {
    if (!node) return { kind: "list", items: [] };
    if (node.kind !== "list") return node; // atoms are literal
    const head = node.items[0];
    if (head?.kind === "symbol" && head.name === "unquote") {
      return valueToSExpr(this.eval(node.items[1] ?? { kind: "list", items: [] }));
    }
    return { kind: "list", items: node.items.map((n) => this.quasi(n)) };
  }

  // ── the agent loop: sense → think → act ──────────────────────────────────────

  /**
   * Instantiate a fresh thought for an entity from its Mind template: bind Self
   * to the entity's name, then bake its current beliefs in (the `,unquote` parts
   * are evaluated against its belief-world; everything else stays as data). The
   * result is a self-contained thought the reducer can resolve over later ticks.
   */
  private instantiate(entity: EntityId): SExpr {
    const template = this.world.get(entity, MIND);
    if (!isSExpr(template)) throw new Error("entity has no Mind to think with");
    const name = this.world.get(entity, NAME);
    if (typeof name !== "string") throw new Error("a thinking entity needs a Name");
    return this.quasi(substSelf(template, name));
  }

  /**
   * Advance the simulation one tick, in phases so moves resolve "simultaneously":
   *   SENSE  — refresh every minded entity's beliefs from the world
   *   THINK  — start a thought if idle, then reduce each thought by one step
   *   ACT    — any thought now in normal form is an action term; apply it
   * Because thoughts snapshot beliefs when they start and act all-at-once, an
   * agent acts on a possibly-stale view — which is what makes the chase emerge.
   */
  private doTick(): void {
    const minded = this.world.query(MIND);

    for (const e of minded) sense(this.world, e);

    for (const e of minded) {
      if (!isSExpr(this.world.get(e, THOUGHT))) {
        this.world.set(e, THOUGHT, this.instantiate(e));
      }
      const thought = this.world.get(e, THOUGHT) as SExpr;
      this.world.set(e, THOUGHT, reduceOnce(thought).expr);
    }

    const actions: Array<[EntityId, SExpr]> = [];
    for (const e of minded) {
      const thought = this.world.get(e, THOUGHT);
      if (isSExpr(thought) && isValue(thought)) {
        this.world.unset(e, THOUGHT);
        actions.push([e, thought]);
      }
    }
    for (const [, action] of actions) this.eval(action); // apply as a command

    this.clock += 1;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private asName(v: Value): string {
    if (typeof v !== "string") {
      throw new Error(`expected a name, got ${JSON.stringify(v)}`);
    }
    return v;
  }

  private asCode(v: Value, who: string): SExpr {
    if (!isSExpr(v)) throw new Error(`${who} expects quoted code (an s-expression)`);
    return v;
  }

  private findByName(name: string): EntityId | undefined {
    return this.world.query(NAME).find((id) => this.world.get(id, NAME) === name);
  }

  private require(name: string): EntityId {
    const id = this.findByName(name);
    if (id === undefined) throw new Error(`no entity named "${name}"`);
    return id;
  }

  // ── builtins ────────────────────────────────────────────────────────────────

  private makeBuiltins(): Record<string, Builtin> {
    const w = this.world;

    return {
      // (entity Wolf) -> create a named entity. Errors if the name is taken.
      entity: (args) => {
        const name = this.asName(args[0]);
        if (this.findByName(name) !== undefined) {
          throw new Error(`entity "${name}" already exists`);
        }
        const id = w.create();
        w.set(id, NAME, name);
        return name;
      },

      // (location Forest) -> create (or tag) an entity as a place.
      location: (args) => {
        const name = this.asName(args[0]);
        let id = this.findByName(name);
        if (id === undefined) {
          id = w.create();
          w.set(id, NAME, name);
        }
        w.set(id, PLACE, true);
        return name;
      },

      // (move Wolf Forest) -> put Wolf at Forest. Destination must be a place.
      move: (args) => {
        const thing = this.require(this.asName(args[0]));
        const destName = this.asName(args[1]);
        const dest = this.require(destName);
        if (!w.has(dest, PLACE)) {
          throw new Error(`"${destName}" is not a location — tag it with (location ${destName})`);
        }
        w.set(thing, AT, dest);
        return this.asName(args[0]);
      },

      // (where Wolf) -> name of the location Wolf is in, or null.
      where: (args) => {
        const id = this.require(this.asName(args[0]));
        const at = w.get(id, AT);
        if (typeof at !== "number") return null;
        const name = w.get(at, NAME);
        return typeof name === "string" ? name : null;
      },

      // (set Wolf hp 10) -> attach an arbitrary component. Generic ECS power.
      // The value may be quoted code: (set Wolf plan '(move Wolf Forest)).
      set: (args) => {
        const id = this.require(this.asName(args[0]));
        const component = this.asName(args[1]);
        w.set(id, component, args[2] ?? true);
        return this.asName(args[0]);
      },

      // (eval '(...)) -> run code that was stored/quoted as data.
      eval: (args) => {
        const code = args[0];
        if (!isSExpr(code)) {
          throw new Error("eval expects quoted code (an s-expression)");
        }
        return this.eval(code);
      },

      // (reduce '(...)) -> fully resolve a "thought" via the step reducer.
      // (step '(...))   -> perform a single reduction (one tick of thinking).
      // Playground hooks onto the pure reducer; the clock (C) will drive these.
      reduce: (args) => normalize(this.asCode(args[0], "reduce")).expr,
      step: (args) => reduceOnce(this.asCode(args[0], "step")).expr,

      // (sense Wolf)   -> rebuild Wolf's belief mini-world from what it perceives.
      // (sense Wolf 3) -> also model others' beliefs, nested up to depth 3.
      sense: (args) => {
        const id = this.require(this.asName(args[0]));
        const depth = typeof args[1] === "number" ? args[1] : 1;
        sense(w, id, depth);
        return this.asName(args[0]);
      },

      // (believes Wolf) -> snapshot of Wolf's belief mini-world.
      believes: (args) => {
        const id = this.require(this.asName(args[0]));
        const beliefs = w.get(id, BELIEFS);
        return beliefs instanceof World ? (beliefs.snapshot() as unknown as Value) : null;
      },

      // (recall Wolf Sheep) -> where Wolf *believes* Sheep is (may be stale).
      recall: (args) =>
        recall(w, this.require(this.asName(args[0])), this.asName(args[1])),

      // (mind Sheep '(if (= ,(recall Self Wolf) Pasture) (move Self Barn) ...))
      // Store a behavior template. `Self` binds to the entity; `,perception`
      // bakes a belief at think-start; the rest stays as data to reduce.
      mind: (args) => {
        const id = this.require(this.asName(args[0]));
        if (!isSExpr(args[1])) throw new Error("mind expects a quoted template");
        w.set(id, MIND, args[1]);
        return this.asName(args[0]);
      },

      // (stay) -> the do-nothing action.
      stay: () => null,

      // (tick) / (run 10) -> advance the sense→think→act loop. (clock) -> now.
      tick: () => {
        this.doTick();
        return this.clock;
      },
      run: (args) => {
        const n = typeof args[0] === "number" ? Math.min(args[0], 1000) : 1;
        for (let i = 0; i < n; i++) this.doTick();
        return this.clock;
      },
      clock: () => this.clock,

      // (get Wolf hp) -> value of a component, or null.
      get: (args) => {
        const id = this.require(this.asName(args[0]));
        const component = this.asName(args[1]);
        return (w.get(id, component) ?? null) as Value;
      },

      // (destroy Wolf) -> remove an entity entirely.
      destroy: (args) => {
        const name = this.asName(args[0]);
        w.destroy(this.require(name));
        return name;
      },

      // (list) -> a snapshot of every entity and its components.
      list: () => w.snapshot() as unknown as Value,
    };
  }
}
