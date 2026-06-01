// ─────────────────────────────────────────────────────────────────────────
// Sense platform — the only bridge from world-truth to an entity's beliefs
//
// An entity decides from its *beliefs*, never from global truth. `sense` runs
// one perception pass for an observer: it (re)builds the observer's belief
// mini-world — a nested World stored in its Beliefs component — from what it
// can currently perceive. Because that belief-world holds entities that may
// themselves have Beliefs, this naturally expresses recursive theory-of-mind
// ("I think you think…"), bounded by `depth` so it terminates.
//
// v1 sensing is perfect & global (every entity is sensed exactly). Imperfect
// sensing — range, noise, staleness-by-failure — plugs in HERE later without
// touching how thoughts are evaluated. The staleness that already matters comes
// from elsewhere: an entity acts on the belief snapshot it took when it began
// thinking, which ages while it thinks.
// ─────────────────────────────────────────────────────────────────────────

import { World, type EntityId } from "./ecs";
import { AT, BELIEFS, NAME, PLACE } from "./components";

/**
 * Build `observer`'s belief mini-world from `world`, store it on the observer,
 * and return it. `depth` bounds recursive belief-of-belief nesting: at depth 1
 * the mirrored entities carry no beliefs of their own; at depth d>1 each gets a
 * belief-world built from truth as well (the observer's model of *their* model).
 */
export function sense(world: World, observer: EntityId, depth = 1): World {
  const beliefs = new World();

  // v1: the observer perceives every entity. Mirror them, mapping real ids to
  // fresh belief-world ids so cross-references (At) stay internally consistent.
  const sensed = world.all();
  const idMap = new Map<EntityId, EntityId>();
  for (const real of sensed) idMap.set(real, beliefs.create());

  for (const real of sensed) {
    const belief = idMap.get(real)!;

    const name = world.get(real, NAME);
    if (name !== undefined) beliefs.set(belief, NAME, name);
    if (world.has(real, PLACE)) beliefs.set(belief, PLACE, true);

    const at = world.get(real, AT);
    if (typeof at === "number" && idMap.has(at)) {
      beliefs.set(belief, AT, idMap.get(at)!);
    }

    if (depth > 1) {
      beliefs.set(belief, BELIEFS, sense(world, real, depth - 1));
    }
  }

  world.set(observer, BELIEFS, beliefs);
  return beliefs;
}

/** Find a belief-entity by name within a belief-world. */
function findByName(beliefs: World, name: string): EntityId | undefined {
  return beliefs.query(NAME).find((id) => beliefs.get(id, NAME) === name);
}

/**
 * Where does `observer` *believe* `subjectName` is? Reads only the observer's
 * belief-world, so it can differ from truth (a stale or absent belief → null).
 */
export function recall(
  world: World,
  observer: EntityId,
  subjectName: string,
): string | null {
  const beliefs = world.get(observer, BELIEFS);
  if (!(beliefs instanceof World)) return null;
  const subject = findByName(beliefs, subjectName);
  if (subject === undefined) return null;
  const at = beliefs.get(subject, AT);
  if (typeof at !== "number") return null;
  const place = beliefs.get(at, NAME);
  return typeof place === "string" ? place : null;
}
