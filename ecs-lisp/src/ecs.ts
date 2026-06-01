// ─────────────────────────────────────────────────────────────────────────
// Entity Component System
//
// The world knows nothing about games, locations, or wolves. It only knows:
//   - entities are opaque integer ids
//   - a component is a named bag of data attached to an entity
//   - you can set / get / query components
//
// Everything game-specific (Name, Place, At, ...) is just a component name a
// string convention agreed on by the interpreter. The ECS stays generic.
// ─────────────────────────────────────────────────────────────────────────

export type EntityId = number;

/** A value that can live in a component. Deliberately permissive. */
export type ComponentValue = number | string | boolean | EntityId | null;

export class World {
  private nextId: EntityId = 1;
  private readonly entities = new Set<EntityId>();
  /** component name -> (entity -> value) */
  private readonly stores = new Map<string, Map<EntityId, ComponentValue>>();

  /** Create a fresh, empty entity and return its id. */
  create(): EntityId {
    const id = this.nextId++;
    this.entities.add(id);
    return id;
  }

  /** Remove an entity and all of its components. */
  destroy(id: EntityId): void {
    this.entities.delete(id);
    for (const store of this.stores.values()) store.delete(id);
  }

  exists(id: EntityId): boolean {
    return this.entities.has(id);
  }

  private storeFor(component: string): Map<EntityId, ComponentValue> {
    let store = this.stores.get(component);
    if (!store) {
      store = new Map();
      this.stores.set(component, store);
    }
    return store;
  }

  set(id: EntityId, component: string, value: ComponentValue): void {
    this.storeFor(component).set(id, value);
  }

  get(id: EntityId, component: string): ComponentValue | undefined {
    return this.stores.get(component)?.get(id);
  }

  has(id: EntityId, component: string): boolean {
    return this.stores.get(component)?.has(id) ?? false;
  }

  unset(id: EntityId, component: string): void {
    this.stores.get(component)?.delete(id);
  }

  /** All live entities that have every one of the named components. */
  query(...components: string[]): EntityId[] {
    return [...this.entities].filter((id) =>
      components.every((c) => this.has(id, c)),
    );
  }

  all(): EntityId[] {
    return [...this.entities];
  }

  /** Every component currently attached to an entity, as a plain object. */
  componentsOf(id: EntityId): Record<string, ComponentValue> {
    const out: Record<string, ComponentValue> = {};
    for (const [name, store] of this.stores) {
      const value = store.get(id);
      if (value !== undefined) out[name] = value;
    }
    return out;
  }

  /** A serialisable picture of the whole world — handy for rendering. */
  snapshot(): Array<{ id: EntityId; components: Record<string, ComponentValue> }> {
    return this.all()
      .sort((a, b) => a - b)
      .map((id) => ({ id, components: this.componentsOf(id) }));
  }
}
