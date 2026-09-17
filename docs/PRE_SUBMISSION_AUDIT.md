# Pre-submission Audit & Consistency Checker

Adds a deterministic, local-only audit layer over the existing AST/diagnostic/layout pipeline.

## Checks

- Orphan labelled figures/tables and broken cross-references.
- Missing BibTeX keys and unused bibliography entries.
- Empty sections and heading-level jumps.
- Abstract, conclusion and template TOC presence.
- Mixed Vietnamese/English captions.
- Inconsistent chapter-title casing.
- Common unit notation conflicts (`m/s2` vs `m/s²`, `Ohm` vs `Ω`).
- Page-budget checks, formula shrink warnings and table formula errors.

The audit report is separate from the compiler diagnostics so P1 source data stays untouched. Every actionable finding carries a source line when available and the UI can jump to it through the existing `requestGotoLine` path.
