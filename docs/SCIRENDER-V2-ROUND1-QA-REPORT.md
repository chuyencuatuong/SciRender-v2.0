# SciRender v2.0 — Đợt 1 Root-Cause / QA-QC Remediation Report

**Ngày audit:** 19 September 2026  
**Nguồn audit:** `SciRender-v2.0-v3-fixed.zip` + `SciRender-v2.0-ROOT-CAUSE-REPORT.md`  
**Phạm vi:** blocker interaction, layout pagination, diagram studio, parser/AST round-trip, table formula engine, hidden regressions.

## 1. Kết luận điều tra

Bản ZIP được cung cấp đã chứa phần lớn remediation V3 được ghi nhận trong root-cause report trước đó. Tôi không coi các static assertion đó là đủ, nên đã truy vết lại data-flow / event-flow / render-flow và phát hiện thêm 3 điểm cần harden:

1. **Table Context Menu vẫn còn một race/event-order bug:** listener `document.pointerdown` chạy ở **capture phase** của `TableEditor` không nhận biết React Portal của `TableContextMenu`, vì portal nằm ngoài `tableEditorRef`. Vì vậy click menu có thể làm `selectedCells` bị clear **trước** `MenuAction.onClick`.
2. **Identity isolation chưa đồng nhất giữa mọi loại fragment:** table continuation đã clear `id`, `data-sr-id`, `data-sr-block-id`, nhưng paragraph/list/code continuation trước đó chỉ/hoặc chưa clear đầy đủ. Điều này có thể sinh duplicate DOM IDs/anchors khi một block bị split.
3. **Code-block continuation caption có thể tích lũy `(tiếp theo)` qua trang 3+** vì logic nối suffix chưa idempotent như table.

Các điểm trên đã được sửa trực tiếp trong workspace.

## 2. Root Cause & remediation

| Hạng mục | Root Cause | Remediation đã triển khai | Trạng thái |
|---|---|---|---|
| **Table Context Menu — action click dead/desync** | `TableEditor` dùng `document.pointerdown` capture để clear selection. `TableContextMenu` lại render qua `createPortal(..., document.body)`, nên menu không nằm trong `tableEditorRef`. Capture listener nhận event trước khi button `onClick` chạy và có thể xoá `selectedCells`/anchor/bounds. | Thêm identity marker `data-sr-table-context-menu="1"` cho portal; selection lifecycle nhận diện marker này như một phần của table interaction và không clear selection khi pointerdown nằm trong menu. | **Đã harden** |
| **Long table mất tail** | Trong V3 baseline, `queue.unshift(tail)` đã tồn tại nhưng cần bảo đảm conservation độc lập ở ranh giới `split -> paginate`; fragment continuation còn phải có identity isolation. | Giữ invariant `headRows + tailRows === sourceRows`; đo lại clone thực; không cắt qua `rowspan`; clear identity tail; đánh dấu continuation; queue tail như first-class fragment. | **Đã harden / regression smoke PASS** |
| **Fragment identity khi split paragraph/list/code** | Các clone của fragment giữ lại một phần `id` / `data-sr-id` / `data-sr-block-id`, có thể tạo duplicate anchors và làm `pageOfNode`/internal links trỏ sai. | Chuẩn hoá thành `clearFragmentIdentity()` và dùng chung cho tail của paragraph, list, code và table. | **Đã sửa** |
| **Code caption `(tiếp theo)` lặp nhiều lần** | `splitCodeBlock()` append suffix trực tiếp mỗi lần split; trang 3 có thể thành `Caption (tiếp theo) (tiếp theo)`. | Dùng `stripContinuationSuffix()` + rebuild suffix theo kiểu idempotent, đồng nhất với table. | **Đã sửa** |
| **Diagram zoom blur** | V3 baseline đã loại CSS `transform: scale()` khỏi wrapper và chuyển sang vector-native `viewBox`. | Audit xác nhận `applyDiagramViewport()` chỉnh `viewBox`; không có CSS rasterization wrapper. | **Đã xác nhận** |
| **Diagram wheel leak** | React delegated wheel event không phải interception point đủ chắc cho Ctrl/Cmd+Wheel ở một số Chromium path. | Native `{ passive:false }` listener trên preview; `preventDefault()` + `stopPropagation()`; cleanup khi unmount/re-run. | **Đã xác nhận** |
| **Diagram zoom geometry** | Công thức cũ có thể dùng sai scale ratio khi zoom quanh cursor. | V3 baseline dùng inverse zoom `1/currentZoom` và `1/nextZoom`; pan scale theo inverse zoom. | **Đã xác nhận** |
| **Direction control contrast** | Token màu cũ không đủ tương phản trên dark UI. | V3 baseline thêm `--sr-diagram-control-ink*` và style hover/active. | **Đã xác nhận** |
| **Parser / round-trip** | Rà block parser, table merge metadata, viewport attrs và source serialization. Không phát hiện data-loss regression mới cần patch trong phạm vi audit này. | Giữ source-of-truth Markdown/AST; không thay đổi parser chỉ vì thay đổi layout fragment. | **PASS static review** |
| **Mini-spreadsheet formulas** | Cần kiểm tra chu kỳ và arithmetic error path, tránh recursion vô hạn / throw ra ngoài. | Audit `stack` + `cache` cycle guard; runtime smoke trực tiếp trên module transpiled xác nhận `DIV_ZERO`, `CIRCULAR_REF`, `SUM`, `AVERAGE` xử lý đúng. | **PASS targeted runtime smoke** |

## 3. Chi tiết blocker #1 — Table Context Menu

### Event flow trước patch

`cell selection` → `contextmenu` → `TableContextMenu` portal vào `document.body` → user pointerdown trên menu → `document.pointerdown` capture của `TableEditor` → `tableEditorRef.contains(target) === false` → `clearSelection()` → React render lại → `MenuAction.onClick` không còn snapshot selection/bounds như lúc mở menu.

Điểm đáng chú ý là `onMouseDown={stopPropagation}` ở menu không đủ, vì nó nằm ở bubble phase trong khi listener gây clear selection nằm ở capture phase.

### Patch

`apps/web/src/components/canvas/CardEditors.tsx`:

- `onPointerDown()` chỉ clear selection khi target thực sự nằm ngoài editor **và** không nằm trong `[data-sr-table-context-menu]`.
- `TableContextMenu` được đánh dấu `data-sr-table-context-menu="1"`.

Đây là fix đúng ở event-boundary, không phải delay `setTimeout`, không phải clone selection sang state tạm để né race.

## 4. Chi tiết blocker #2 — Long Table

V3 baseline đã có:

- clone-measure thật sau khi loại row;
- tối thiểu 2 row mỗi phía;
- không split qua `rowspan` boundary;
- repeat `<thead>` qua clone;
- conservation guard `headRows + tailRows === sourceRows` trong `splitTable()` và trước `queue.unshift(tail)` trong `paginate()`;
- clear fragment identity trên tail;
- continuation metadata.

Audit bổ sung xác nhận continuation không bị “drop bởi queue” trong source hiện tại: queue thực sự `unshift(tail)` và structural split chỉ được commit khi conservation invariant còn đúng.

## 5. Hidden Bug — Fragment identity leak

`splitElementAt()`, `splitList()` và `splitCodeBlock()` đều tạo clone. Nếu tail giữ `id`, `data-sr-id` hoặc `data-sr-block-id`, HTML output của tài liệu nhiều trang có thể chứa duplicate identities. Đây là lỗi độc lập với việc dữ liệu text có bị mất hay không.

### Fix

Tạo và export helper dùng chung:

```ts
export function clearFragmentIdentity(fragment: Element): void
```

Helper xoá:

- `id`
- `data-sr-id`
- `data-sr-block-id`

ở wrapper và toàn bộ descendants. Chỉ **tail** bị neutralize; **head** giữ identity gốc để references/page mapping vẫn có anchor canonical.

## 6. Hidden Bug — Code continuation caption

Table đã có cơ chế idempotent suffix stripping nhưng code block chưa có. Với code block dài hơn 2 page:

`Caption` → `Caption (tiếp theo)` → `Caption (tiếp theo) (tiếp theo)`

Patch đã chuyển code path sang `stripContinuationSuffix()` trước khi append suffix mới.

## 7. Verification

### PASS

- `node scripts/smoke-root-cause-v3.mjs` — **PASS** toàn bộ assertions, gồm cả regression mới cho portal action click, fragment identities và code caption.
- `node scripts/smoke-native-core-interaction.mjs` — **PASS** toàn bộ assertions.
- Transpile/syntax check bằng TypeScript `transpileModule()` cho 3 source TS/TSX đã sửa — **PASS**.
- Runtime targeted formula smoke — **PASS** cho division-by-zero, circular reference, SUM, AVERAGE.

### Không thể chạy full build/browser

Archive không chứa `node_modules`. `corepack` không tải được `pnpm@10.34.5` từ registry do `EAI_AGAIN`, nên:

- `pnpm typecheck`: **chưa thể chạy đầy đủ**
- `pnpm build`: **chưa thể chạy**
- Browser/Playwright E2E: **chưa thể chạy**
- `node scripts/run-smoke.mjs` và pre-submission smoke cần `esbuild`, hiện dependency chưa có.

Do đó, kết luận “PASS” ở Đợt 1 là **static/targeted verification**, chưa phải browser E2E certification.

## 8. Files thực sự được chỉnh sửa trong lượt audit này

1. `apps/web/src/components/canvas/CardEditors.tsx`
2. `packages/layout-engine/src/split.ts`
3. `packages/layout-engine/src/index.ts`
4. `scripts/smoke-root-cause-v3.mjs`

## 9. Files V3 remediation đã có sẵn trong ZIP và được audit/xác nhận lại

1. `apps/web/src/components/canvas/DiagramDialog.tsx`
2. `apps/web/src/index.css`
3. `apps/web/src/lib/diagram-studio.ts`
4. `packages/renderer-html/src/render-core.ts`
5. `packages/renderer-pdf/src/print.ts`
6. `packages/template-engine/src/css.ts`
7. `package.json`
8. `scripts/smoke-native-core-interaction.mjs`
9. `docs/SYSTEM-AUDIT-V2.0.md`

## 10. Trạng thái workspace sau Đợt 1

Workspace đã giữ nguyên toàn bộ patch để làm baseline cho Đợt 2. **Chưa đóng gói ZIP** theo đúng yêu cầu quy trình 2 đợt.
