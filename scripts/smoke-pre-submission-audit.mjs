import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root = process.cwd();
const outdir = await fs.mkdtemp(path.join(os.tmpdir(), 'scirender-audit-'));
const entry = path.join(outdir, 'entry.mjs');
const code = `
  import { parse } from ${JSON.stringify(path.join(root, 'packages/parser/src/index.ts'))};
  import { assignNumbers, findTemplate, resolveTemplate } from ${JSON.stringify(path.join(root, 'packages/template-engine/src/index.ts'))};
  import { runPreSubmissionAudit } from ${JSON.stringify(path.join(root, 'packages/intelligence/src/pre-submission-audit.ts'))};
  const source = String.raw\`---
  title: Test
  abstract: Tóm tắt.
  bibliography:
    - key: used2026
      authors: \"Nguyen; Tran\"
      title: \"Used\"
      year: \"2026\"
    - key: unused2025
      authors: \"Le\"
      title: \"Unused\"
      year: \"2025\"
  ---
  # CHƯƠNG 1: Intro {#sec:intro}
  ### Nhảy cấp
  Nội dung [@used2026] @fig:missing.
  ![x](asset:x)\n: Hình demo {#fig:demo}\n\n# Chương 2: Kết luận\n\n\`;\n  const parsed = parse(source);\n  const t = resolveTemplate(findTemplate('hcmut-btl'), {});\n  const num = assignNumbers(parsed.document, t.descriptor);\n  const report = runPreSubmissionAudit(parsed.document, [...parsed.diagnostics, ...num.diagnostics], { tocEnabled: true, pageBudget: null }, { pages: 3, bodyPages: 3, warnings: [] });
  if (report.errors < 1) throw new Error('expected at least one audit error');
  if (!report.checks.some((x) => x.code === 'AUD-A001' && x.severity === 'warning')) throw new Error('orphan check missing');
  if (!report.checks.some((x) => x.code === 'AUD-C002' && x.severity === 'warning')) throw new Error('chapter case check missing');
  if (!report.checks.some((x) => x.code === 'AUD-B002' && x.severity === 'warning')) throw new Error('heading jump check missing');
  if (!report.checks.some((x) => x.code === 'AUD-A004' && x.severity === 'warning')) throw new Error('unused bibliography check missing');
  console.log('Pre-submission audit smoke: PASS');
`;
await fs.writeFile(entry, code, 'utf8');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: path.join(outdir, 'bundle.mjs'), logLevel: 'silent' });
await import(`file://${path.join(outdir, 'bundle.mjs')}`);
