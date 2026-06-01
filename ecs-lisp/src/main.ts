// DOM wiring: a small REPL. The console input runs one line at a time; each
// entered line and its result(s) are appended to the history transcript, and
// ↑/↓ recall previous lines like a shell. The right pane renders the world.

import { World, type EntityId } from "./ecs";
import { Interpreter, type Value } from "./interpreter";
import { unparse, parse, isSExpr } from "./parser";
import { DEFAULT_EXAMPLE, EXAMPLES, GLOSSARY, NOTES } from "./library";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const input = $<HTMLInputElement>("input");
const historyEl = $<HTMLDivElement>("history");
const worldEl = $<HTMLPreElement>("world");
const countEl = $<HTMLSpanElement>("count");
const helpEl = $<HTMLDivElement>("help");
const examplesEl = $<HTMLSelectElement>("examples");

const SAVE_KEY = "ecs-lisp.session";

let world = new World();
let lisp = new Interpreter(world);

// Shell-style command recall. `cursor === entered.length` means "fresh line".
const entered: string[] = [];
let cursor = 0;

function nameOf(id: EntityId): string {
  const n = world.get(id, "Name");
  return typeof n === "string" ? n : `#${id}`;
}

/** Where the real entity named `name` actually is, or null. */
function truthLocation(name: string): string | null {
  const id = world.query("Name").find((e) => world.get(e, "Name") === name);
  if (id === undefined) return null;
  const at = world.get(id, "At");
  return typeof at === "number" ? nameOf(at) : null;
}

/** An agent's beliefs about where others are, flagging any that are stale. */
function beliefsOf(agent: EntityId): string {
  const beliefs = world.get(agent, "Beliefs");
  if (!(beliefs instanceof World)) return "(nothing sensed yet)";
  const self = nameOf(agent);
  const parts: string[] = [];
  for (const id of beliefs.query("Name", "At")) {
    const subject = beliefs.get(id, "Name");
    if (typeof subject !== "string" || subject === self) continue;
    const at = beliefs.get(id, "At");
    const believed = typeof at === "number" ? beliefs.get(at, "Name") : null;
    if (typeof believed !== "string") continue;
    const stale = truthLocation(subject) !== believed;
    parts.push(`${subject}@${believed}${stale ? " ⚠" : ""}`);
  }
  return parts.length ? parts.join(", ") : "—";
}

/** Human-readable view: locations with their occupants, then loose entities. */
function renderWorld(): void {
  const lines: string[] = [];

  for (const place of world.query("Place").sort((a, b) => a - b)) {
    const occupants = world
      .query("At")
      .filter((id) => world.get(id, "At") === place)
      .map(nameOf);
    lines.push(`▣ ${nameOf(place)}  (${occupants.length})`);
    for (const occ of occupants) lines.push(`    · ${occ}`);
  }

  const homeless = world
    .all()
    .filter((id) => !world.has(id, "Place") && world.get(id, "At") === undefined)
    .map(nameOf);
  if (homeless.length) {
    lines.push("◌ nowhere");
    for (const h of homeless) lines.push(`    · ${h}`);
  }

  // Agents: location (truth), what they believe, and their in-progress thought.
  const agents = world.query("Mind");
  if (agents.length) {
    lines.push("", "— agents —");
    for (const a of agents.sort((x, y) => x - y)) {
      const at = world.get(a, "At");
      const loc = typeof at === "number" ? nameOf(at) : "nowhere";
      const thought = world.get(a, "Thought");
      const status = isSExpr(thought) ? `thinking ${unparse(thought)}` : "idle";
      lines.push(`◆ ${nameOf(a)} @ ${loc}`);
      lines.push(`    believes: ${beliefsOf(a)}`);
      lines.push(`    ${status}`);
    }
  }

  const json = JSON.stringify(world.snapshot(), jsonReplacer, 2);
  worldEl.textContent =
    (lines.length ? lines.join("\n") : "(empty world)") +
    "\n\n— raw components —\n" +
    json;
  countEl.textContent = `⏱ ${lisp.clock} · ${world.all().length} entities`;
}

// Render quoted code as its source, and a nested belief-world as its snapshot.
function jsonReplacer(_key: string, val: unknown): unknown {
  if (val instanceof World) return val.snapshot();
  if (isSExpr(val)) return `'${unparse(val)}`;
  return val;
}

function fmt(v: Value): string {
  if (v === null) return "null";
  if (isSExpr(v)) return `'${unparse(v)}`;
  if (typeof v === "object") return JSON.stringify(v, jsonReplacer);
  return String(v);
}

/** Append a command + its result line to the history transcript. */
function addEntry(cls: "res" | "err", cmd: string, text: string): void {
  const entry = document.createElement("div");
  entry.className = "entry";

  const c = document.createElement("div");
  c.className = "cmd";
  c.textContent = `› ${cmd}`;
  c.title = "click to edit in console";
  c.addEventListener("click", () => {
    input.value = cmd;
    input.focus();
  });

  const r = document.createElement("div");
  r.className = cls;
  r.textContent = text;

  entry.append(c, r);
  historyEl.append(entry);
  historyEl.scrollTop = historyEl.scrollHeight;
}

/** A dim, non-command status line in the history (saved / loaded / etc.). */
function systemLine(text: string): void {
  const entry = document.createElement("div");
  entry.className = "entry";
  const s = document.createElement("div");
  s.className = "sys";
  s.textContent = `— ${text} —`;
  entry.append(s);
  historyEl.append(entry);
  historyEl.scrollTop = historyEl.scrollHeight;
}

/** Parse + evaluate one source line, form by form, recording each result. */
function runSource(src: string): void {
  let forms;
  try {
    forms = parse(src);
  } catch (e) {
    addEntry("err", src, `✗ ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const form of forms) {
    const text = unparse(form);
    try {
      addEntry("res", text, `→ ${fmt(lisp.eval(form))}`);
    } catch (e) {
      addEntry("err", text, `✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  renderWorld();
}

function submit(): void {
  const src = input.value.trim();
  if (!src) return;
  entered.push(src);
  cursor = entered.length;
  input.value = "";
  runSource(src);
}

/** Move through history; dir -1 = older, +1 = newer. */
function recall(dir: -1 | 1): void {
  if (entered.length === 0) return;
  cursor = Math.max(0, Math.min(entered.length, cursor + dir));
  input.value = cursor < entered.length ? entered[cursor] : "";
  const end = input.value.length;
  requestAnimationFrame(() => input.setSelectionRange(end, end));
}

function reset(): void {
  stopPlay();
  world = new World();
  lisp = new Interpreter(world);
  entered.length = 0;
  cursor = 0;
  historyEl.replaceChildren();
  renderWorld();
}

/** Replay a multi-line program line by line into a fresh world. */
function loadProgram(src: string): void {
  reset();
  for (const line of src.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;
    entered.push(trimmed);
    runSource(trimmed);
  }
  cursor = entered.length;
  renderWorld();
}

function save(): void {
  try {
    localStorage.setItem(SAVE_KEY, entered.join("\n"));
    systemLine("session saved");
  } catch {
    systemLine("could not save (storage unavailable)");
  }
}

function load(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
  if (saved === null) {
    systemLine("nothing saved yet");
    return;
  }
  loadProgram(saved);
  systemLine("session loaded");
}

$("run").addEventListener("click", () => {
  submit();
  input.focus();
});
$("reset").addEventListener("click", reset);
$("tick").addEventListener("click", () => {
  try {
    lisp.run("(tick)");
    systemLine(`tick ${lisp.clock}`);
    renderWorld();
  } catch (e) {
    addEntry("err", "(tick)", `✗ ${e instanceof Error ? e.message : String(e)}`);
  }
  input.focus();
});

// ── Play: auto-advance ticks until paused ───────────────────────────────────
let playTimer: ReturnType<typeof setInterval> | null = null;
const playBtn = $<HTMLButtonElement>("play");

function stopPlay(): void {
  if (playTimer !== null) clearInterval(playTimer);
  playTimer = null;
  playBtn.textContent = "▶ Play";
}

function togglePlay(): void {
  if (playTimer !== null) {
    stopPlay();
    return;
  }
  playBtn.textContent = "⏸ Pause";
  playTimer = setInterval(() => {
    try {
      lisp.run("(tick)");
      renderWorld();
    } catch (e) {
      stopPlay();
      addEntry("err", "(tick)", `✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  }, 650);
}

playBtn.addEventListener("click", togglePlay);
$("save").addEventListener("click", save);
$("load").addEventListener("click", load);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submit();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    recall(-1);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    recall(1);
  }
});

// ── Examples dropdown ──────────────────────────────────────────────────────
for (const name of Object.keys(EXAMPLES)) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  examplesEl.append(opt);
}
examplesEl.addEventListener("change", () => {
  const name = examplesEl.value;
  if (!name) return;
  loadProgram(EXAMPLES[name]);
  systemLine(`loaded example: ${name}`);
  examplesEl.value = ""; // reset back to the "examples…" placeholder
  input.focus();
});

// ── World / Help tabs ──────────────────────────────────────────────────────
const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    const showHelp = tab.dataset.tab === "help";
    helpEl.hidden = !showHelp;
    worldEl.hidden = showHelp;
  });
});

// ── Render the Help glossary (once) ─────────────────────────────────────────
function renderHelp(): void {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = GLOSSARY.map(({ syntax, desc }) => {
    // Color the <...> argument slots; the command name keeps the <dt> color.
    const marked = esc(syntax).replace(
      /&lt;(\w+)&gt;/g,
      '&lt;<span class="arg">$1</span>&gt;',
    );
    return `<dt>${marked}</dt><dd>${esc(desc)}</dd>`;
  }).join("");
  helpEl.innerHTML =
    `<h2>Commands</h2><dl>${rows}</dl>` +
    `<h2>Syntax</h2>${NOTES.map((n) => `<p>${n}</p>`).join("")}`;
}
renderHelp();

// ── Boot ─────────────────────────────────────────────────────────────────────
loadProgram(EXAMPLES[DEFAULT_EXAMPLE]);
input.focus();
