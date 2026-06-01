// Content: built-in example programs and the command glossary.
// Kept separate from the engine and DOM so it's easy to add to.

/** Named example "World Programs" loadable from the Examples dropdown. */
export const EXAMPLES: Record<string, string> = {
  "Forest & Wolf": `; a wolf and a rabbit share the forest
(location Forest)
(location Cave)
(entity Wolf)
(entity Rabbit)
(move Wolf Forest)
(move Rabbit Forest)
(set Wolf hp 12)`,

  "Two rooms": `; move between adjacent rooms
(location Kitchen)
(location Hallway)
(entity Player)
(entity Lamp)
(move Player Kitchen)
(move Lamp Kitchen)
(set Lamp lit "false")`,

  "Bestiary": `; several creatures, varied stats, all in one den
(location Den)
(entity Wolf)   (set Wolf hp 12)  (set Wolf hunger 3)
(entity Bear)   (set Bear hp 30)  (set Bear hunger 1)
(entity Rabbit) (set Rabbit hp 4)
(move Wolf Den)
(move Bear Den)
(move Rabbit Den)`,

  "Empty": ``,
};

export const DEFAULT_EXAMPLE = "Forest & Wolf";

/** One row of the Help glossary. `<...>` segments render as argument slots. */
export const GLOSSARY: Array<{ syntax: string; desc: string }> = [
  { syntax: "(entity <name>)", desc: "create a named entity" },
  { syntax: "(location <name>)", desc: "create / tag an entity as a place" },
  { syntax: "(move <name> <place>)", desc: "put an entity in a location (must be a place)" },
  { syntax: "(where <name>)", desc: "name of the entity's location, or null" },
  { syntax: "(set <name> <component> <value>)", desc: "attach an arbitrary component" },
  { syntax: "(get <name> <component>)", desc: "read a component value" },
  { syntax: "(destroy <name>)", desc: "remove an entity entirely" },
  { syntax: "(list)", desc: "snapshot of every entity + its components" },
  { syntax: "'<expr>", desc: "quote: the expression as data, not run" },
  { syntax: "(eval <code>)", desc: "run quoted code-as-data" },
];

/** Short syntax notes shown under the glossary. */
export const NOTES: string[] = [
  "Bare words are <b>names</b> — <code>Wolf</code>, <code>Forest</code>.",
  'Values can be numbers (<code>10</code>) or strings (<code>"on fire"</code>).',
  "Calls <b>nest</b>: <code>(move (entity Bear) Forest)</code>.",
  "<code>; text</code> to end of line is a comment.",
  "<code>'x</code> is data; <code>(eval 'x)</code> runs it. Store code on an entity: <code>(set Wolf plan '(move Wolf Forest))</code>.",
  "<code>`(at ,(where Wolf))</code> bakes a current value into otherwise-quoted data.",
];
