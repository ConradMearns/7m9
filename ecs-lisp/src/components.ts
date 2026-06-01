// Component-name conventions shared across the interpreter and the Sense
// platform. The ECS itself stays generic; these are just agreed-on strings.

export const NAME = "Name"; // string — the human-facing identifier
export const PLACE = "Place"; // tag (true) — this entity is a location
export const AT = "At"; // EntityId — the location this entity is in
export const BELIEFS = "Beliefs"; // World — this entity's mini-world (what it believes)
export const MIND = "Mind"; // SExpr — this entity's behavior template (a quoted body)
export const THOUGHT = "Thought"; // SExpr — the in-progress thought being reduced
