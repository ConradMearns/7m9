#!/usr/bin/env node
// convert.js — Convert a Dizzy feature YAML to Cytoscape.js elements JSON
//
// Usage:
//   node convert.js <path/to/feature.feat.yaml>
//   node convert.js scan_and_upload.feat.yaml > data.json
//
// Requires: npm install js-yaml  (or: npx --yes js-yaml is not a valid invocation;
//           install via: npm install -g js-yaml, then run this script)

'use strict';

const fs   = require('fs');
const yaml = require('js-yaml');
const path = require('path');

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node convert.js <feature.feat.yaml>');
  process.exit(1);
}

const raw = yaml.load(fs.readFileSync(path.resolve(inputFile), 'utf8'));

const nodes = [];
const edges = [];

// Type metadata
const TYPE_META = {
  cmd:  { typeName: 'Command',   prefix: 'cmd'  },
  evt:  { typeName: 'Event',     prefix: 'evt'  },
  proc: { typeName: 'Procedure', prefix: 'proc' },
  pol:  { typeName: 'Policy',    prefix: 'pol'  },
};

// Commands
for (const [name, desc] of Object.entries(raw.commands || {})) {
  nodes.push({ data: {
    id: `cmd:${name}`,
    label: name.replace(/_/g, '_\n'),
    type: 'cmd',
    typeName: 'Command',
    desc: typeof desc === 'string' ? desc : '',
  }});
}

// Events
for (const [name, desc] of Object.entries(raw.events || {})) {
  nodes.push({ data: {
    id: `evt:${name}`,
    label: name.replace(/_/g, '_\n'),
    type: 'evt',
    typeName: 'Event',
    desc: typeof desc === 'string' ? desc : '',
  }});
}

// Procedures
for (const [name, def] of Object.entries(raw.procedures || {})) {
  nodes.push({ data: {
    id: `proc:${name}`,
    label: name.replace(/_/g, '_\n'),
    type: 'proc',
    typeName: 'Procedure',
    desc: typeof def.description === 'string' ? def.description.trim() : '',
  }});

  // Command → Procedure edge
  if (def.command) {
    edges.push({ data: { source: `cmd:${def.command}`, target: `proc:${name}`, label: 'triggers' }});
  }

  // Procedure → Event edges
  for (const evt of (def.emits || [])) {
    edges.push({ data: { source: `proc:${name}`, target: `evt:${evt}`, label: 'emits' }});
  }
}

// Policies
for (const [name, def] of Object.entries(raw.policies || {})) {
  nodes.push({ data: {
    id: `pol:${name}`,
    label: name.replace(/_/g, '_\n'),
    type: 'pol',
    typeName: 'Policy',
    desc: typeof def.description === 'string' ? def.description.trim() : '',
  }});

  // Event → Policy edge
  if (def.event) {
    edges.push({ data: { source: `evt:${def.event}`, target: `pol:${name}`, label: 'handled by' }});
  }

  // Policy → Command edges (cycle back)
  for (const cmd of (def.emits || [])) {
    edges.push({ data: { source: `pol:${name}`, target: `cmd:${cmd}`, label: 'emits', cycle: true }});
  }
}

const output = { nodes, edges };
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
