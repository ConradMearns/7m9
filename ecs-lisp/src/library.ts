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

  "Wolf & Sheep (evasion)": `; Sustained evasion across 3 locations, using list ops on beliefs.
; The Wolf chases the Sheep's REMEMBERED spot — so the Sheep stays safe
; by always VACATING its own spot (where the Wolf is heading) and the
; believed Wolf spot. Both deliberate at the same pace → a perpetual
; chase, the Wolf forever one step behind. Press ▶ Play and watch.
(location Pasture)
(location Barn)
(location Meadow)
(entity Wolf)
(entity Sheep)
(move Wolf Barn)
(move Sheep Pasture)
; Sheep: go to a place that is neither the believed Wolf spot nor my own.
(mind Sheep '(move Self
  (first (without (without ,(locations) ,(recall Self Wolf))
                  ,(recall Self Self)))))
; Wolf: if the Sheep is somewhere other than here, go there; else wait.
(mind Wolf '(if (member? ,(recall Self Sheep) (without ,(locations) ,(recall Self Self)))
                (move Self ,(recall Self Sheep))
                (stay)))`,

  "Reducer playground": `; A "thought" resolves one redex per step toward an action term.
; Run (step '(...)) repeatedly to watch it, or (reduce '(...)) to finish.
(step '(move Self (if (= Pasture Pasture) Barn Pasture)))
(reduce '(move Self (if (= Pasture Pasture) Barn Pasture)))
(reduce '(+ (+ 1 2) (+ 3 4)))`,

  "Belief vs truth": `; an entity acts on what it BELIEVES, not on global truth.
(location Pasture)
(location Barn)
(entity Wolf)
(entity Sheep)
(move Sheep Pasture)
(sense Wolf)        ; Wolf looks: now believes Sheep is at Pasture
(move Sheep Barn)   ; Sheep slips away; Wolf hasn't looked again
(recall Wolf Sheep) ; => Pasture  (stale belief!)
(where Sheep)       ; => Barn     (the truth)
(sense Wolf)        ; Wolf looks again
(recall Wolf Sheep) ; => Barn`,

  "Nested minds": `; recursive theory-of-mind, bounded by a depth limit.
; Wolf models Sheep, who models Wolf, who models Sheep... up to depth 4.
(location Pasture)
(location Barn)
(entity Wolf)
(entity Sheep)
(move Wolf Barn)
(move Sheep Pasture)
(sense Wolf 4)      ; build beliefs 4 levels deep
(introspect Wolf)   ; "I think you think I think..." as a tree
(believes Wolf)     ; the same thing as raw nested mini-worlds`,

  "Wolf & Sheep": `; sense -> think -> act. Then press ▶ Play (or ⏱ Tick) and watch.
; Each acts on what it BELIEVES — ⚠ marks a stale belief in the World pane.
; Wolf: go to where it believes the Sheep is (lags → it chases).
; Sheep: if it believes the Wolf is at Pasture, flee to Barn, else go Pasture.
(location Pasture)
(location Barn)
(entity Wolf)
(entity Sheep)
(move Wolf Barn)
(move Sheep Pasture)
(mind Wolf  '(if ,(recall Self Sheep) (move Self ,(recall Self Sheep)) (stay)))
(mind Sheep '(if (= ,(recall Self Wolf) Pasture) (move Self Barn) (move Self Pasture)))`,

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
  { syntax: "(reduce <code>)", desc: "fully resolve a thought (step reducer)" },
  { syntax: "(step <code>)", desc: "one reduction of a thought (one tick)" },
  { syntax: "(sense <name> <depth?>)", desc: "rebuild an entity's belief mini-world" },
  { syntax: "(believes <name>)", desc: "snapshot of what an entity believes" },
  { syntax: "(recall <name> <subject>)", desc: "where <name> believes <subject> is" },
  { syntax: "(introspect <name>)", desc: "nested-belief tree (theory of mind)" },
  { syntax: "(mind <name> '<template>)", desc: "give an entity a behavior template" },
  { syntax: "(stay)", desc: "the do-nothing action" },
  { syntax: "(locations)", desc: "names of every place (a list)" },
  { syntax: "(list <a> <b> …)", desc: "build a list value" },
  { syntax: "(first <list>) / (rest …)", desc: "head / tail of a list" },
  { syntax: "(member? <x> <list>)", desc: "is x in the list?" },
  { syntax: "(without <list> <x>)", desc: "list with x removed" },
  { syntax: "(tick)", desc: "advance the simulation one step" },
  { syntax: "(run <n>)", desc: "advance the simulation n steps" },
  { syntax: "(clock)", desc: "current tick count" },
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
