/**
 * Syntax colouring for fenced code blocks.
 *
 * Two rules govern this file:
 *
 * - **P1.** Colouring may add markup, never change a character of the author's
 *   code. Every result is checked by stripping the tags back out and comparing
 *   with the input; a mismatch falls back to plain, escaped text.
 * - **P5.** highlight.js ships inside the bundle. Only the languages listed
 *   below are registered, so nothing is fetched and nothing is guessed.
 */
import hljs from 'highlight.js/lib/core';
import arduino from 'highlight.js/lib/languages/arduino';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import latex from 'highlight.js/lib/languages/latex';
import matlab from 'highlight.js/lib/languages/matlab';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import verilog from 'highlight.js/lib/languages/verilog';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

import { escapeHtml } from './escape.js';

let registered = false;

function register(): void {
  if (registered) return;
  const langs: Array<[string, Parameters<typeof hljs.registerLanguage>[1]]> = [
    ['arduino', arduino],
    ['bash', bash],
    ['c', c],
    ['cpp', cpp],
    ['csharp', csharp],
    ['java', java],
    ['javascript', javascript],
    ['json', json],
    ['latex', latex],
    ['matlab', matlab],
    ['python', python],
    ['r', r],
    ['sql', sql],
    ['typescript', typescript],
    ['verilog', verilog],
    ['xml', xml],
    ['yaml', yaml],
  ];
  for (const [name, def] of langs) hljs.registerLanguage(name, def);
  hljs.configure({ classPrefix: 'sr-hl-' });
  registered = true;
}

/** Fence label -> registered language. Anything else is left uncoloured. */
const ALIASES: Record<string, string> = {
  'c++': 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  csharp: 'csharp',
  ino: 'arduino',
  arduino: 'arduino',
  py: 'python',
  python: 'python',
  python3: 'python',
  m: 'matlab',
  matlab: 'matlab',
  octave: 'matlab',
  js: 'javascript',
  jsx: 'javascript',
  javascript: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  java: 'java',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  bash: 'bash',
  console: 'bash',
  sql: 'sql',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  r: 'r',
  tex: 'latex',
  latex: 'latex',
  verilog: 'verilog',
  v: 'verilog',
  sv: 'verilog',
};

export interface HighlightResult {
  /** Ready-to-insert HTML for the inside of <code>. */
  html: string;
  /** The language actually used, or null when the code was left plain. */
  language: string | null;
}

/** Turns marked-up HTML back into the text it represents. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function highlightCode(value: string, lang: string | null): HighlightResult {
  const plain = { html: escapeHtml(value), language: null };
  if (!lang) return plain;
  const language = ALIASES[lang.trim().toLowerCase()];
  if (!language) return plain;

  register();
  let html: string;
  try {
    html = hljs.highlight(value, { language, ignoreIllegals: true }).value;
  } catch {
    return plain;
  }

  // P1 — colouring that would change the code is thrown away, not shipped.
  if (textOf(html) !== value) return plain;
  return { html, language };
}
