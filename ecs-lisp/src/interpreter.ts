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

import type { ComponentValue, EntityId, World } from "./ecs";
import { parse, type SExpr } from "./parser";

export type Value =
  | ComponentValue
  | Value[]
  | { [key: string]: Value };

type Builtin = (args: Value[]) => Value;

// Component-name conventions the interpreter agrees on:
const NAME = "Name"; // string, the human-facing identifier
const PLACE = "Place"; // tag (true) marking an entity as a location
const AT = "At"; // EntityId, the location an entity is currently in

export class Interpreter {
  readonly builtins: Record<string, Builtin>;

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
        const fn = this.builtins[head.name];
        if (!fn) throw new Error(`unknown command: "${head.name}"`);
        const args = expr.items.slice(1).map((a) => this.eval(a));
        return fn(args);
      }
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private asName(v: Value): string {
    if (typeof v !== "string") {
      throw new Error(`expected a name, got ${JSON.stringify(v)}`);
    }
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
      set: (args) => {
        const id = this.require(this.asName(args[0]));
        const component = this.asName(args[1]);
        const value = (args[2] ?? true) as ComponentValue;
        w.set(id, component, value);
        return this.asName(args[0]);
      },

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
