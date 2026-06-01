# ecs-lisp

A foundation for a game that mixes an **Entity Component System** with a
**LISP parser-combinator** command language. You type s-expressions; they mutate
a world; the world is rendered as text + JSON.

```lisp
(location Forest)
(entity Wolf)
(move Wolf Forest)   ; → Wolf is now at Forest
```

## Run it

No build tooling beyond Bun — TypeScript compiles transparently.

```bash
bun install
bun run dev      # dev server with hot reload  → http://localhost:3000
bun run build    # bundle to static files in dist/  (open dist/index.html)
bun test         # parser + interpreter unit tests
bun run typecheck
```

`bun ./index.html` bundles the `<script src="./src/main.ts">` entrypoint on the
fly; `bun build ./index.html` emits a plain static page you can host anywhere.

## How it's put together

Three decoupled layers (`src/`):

| File             | Responsibility |
|------------------|----------------|
| `ecs.ts`         | Generic World. Entities are ids; components are named data. No game concepts. |
| `parser.ts`      | Parser combinators (`regex`/`alt`/`many`/`lazy`) composed into a LISP reader → `SExpr` AST. |
| `interpreter.ts` | Evaluates the AST, dispatching `(command …)` to builtins that mutate the World. |
| `library.ts`     | Content: built-in example programs + the Help glossary. |
| `main.ts`        | DOM glue: REPL console, history, save/load, tabs, world rendering. |

### Evaluation model

- `number` / `string` → themselves
- `symbol` → its name as a string (a bare name literal)
- `(head a b …)` → call builtin `head` with the evaluated args

Because symbols are name literals and args evaluate first, calls nest:
`(move (entity Bear) Forest)`.

### The "location system"

It's just two component conventions, not special engine code:

- `Place` — a tag marking an entity as a location.
- `At` — points an entity at the location entity it currently occupies.

`move` enforces that the destination has a `Place` tag.

### Using the app

- **Console** (bottom-left): type one line, **Enter** to run. **↑ / ↓** recall
  previous lines; click any line in **History** to edit it again.
- **Examples** dropdown: load a built-in World Program (see `src/library.ts`).
- **Save / Load**: persist the current session to the browser (`localStorage`).
- **Help** tab (top-right): the command glossary, generated from `src/library.ts`.
- `; comments` run to the end of the line and are ignored by the parser.

### Builtins

| Command | Effect |
|---------|--------|
| `(entity Wolf)` | create a named entity (errors if the name exists) |
| `(location Forest)` | create / tag an entity as a place |
| `(move Wolf Forest)` | put an entity at a location |
| `(where Wolf)` | name of the entity's location, or `null` |
| `(set Wolf hp 10)` | attach an arbitrary component (generic ECS power) |
| `(get Wolf hp)` | read a component |
| `(destroy Wolf)` | remove an entity |
| `(list)` | snapshot every entity + components |

## Where to take it next

- More components/systems: `health`, `inventory`, adjacency between locations.
- A `tick` builtin that runs systems (e.g. movement, decay) over the world.
- Variables / `let` bindings in the LISP so commands can return and reuse refs.
- Persisted worlds (serialize the snapshot to `localStorage`).
