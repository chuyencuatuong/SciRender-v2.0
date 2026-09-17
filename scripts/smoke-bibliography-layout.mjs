import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const css = fs.readFileSync(new URL("packages/template-engine/src/css.ts", root), "utf8");
const renderer = fs.readFileSync(new URL("packages/renderer-html/src/index.ts", root), "utf8");

assert.match(css, /grid-template-columns:2\.5rem minmax\(0,1fr\)/);
assert.match(css, /\.sr-doc \.sr-reference-list[\s\S]*?width:100%/);
assert.match(css, /\.sr-doc \.sr-bibliography-item-content,\.sr-doc \.sr-reference-item-content[\s\S]*?min-width:0/);
assert.match(css, /\.sr-doc \.sr-bibliography-item-label,\.sr-doc \.sr-reference-item-label/);
assert.match(renderer, /class=\"sr-bibliography-item sr-reference-item/);
assert.match(renderer, /sr-bibliography-item-label/);
assert.match(renderer, /sr-bibliography-item-content/);

// The list item must expose only two direct grid children: label + content.
// The back-reference link is inside the content cell, preventing an implicit 3rd grid column.
const itemSource = renderer.match(/return `(<li id=\"\$\{escapeAttr\(anchor\)\}\"[\s\S]*?<\/li>)`;/);
assert.ok(itemSource, "bibliography item template not found");
assert.match(itemSource[1], /<span class=\"\$\{contentClass\}\">\$\{escapeHtml\(body\)\}\$\{backLink\}<\/span>/);

console.log("HM5 bibliography layout smoke: PASS");
