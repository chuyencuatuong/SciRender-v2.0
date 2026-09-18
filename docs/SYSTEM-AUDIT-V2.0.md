# SciRender v2.0 — System Audit & Remediation

## Phạm vi

Đã rà soát source path của `apps/web`, `packages/layout-engine`, `packages/parser`, `packages/ast`, `packages/figure-engine`, `packages/template-engine`, `packages/renderer-html`, `packages/renderer-pdf` và state/render path trong `apps/web/src/state`.

## Các vấn đề nghiêm trọng và xử lý

### 1. Table Context Menu — tọa độ viewport

Trong archive gốc, `TableContextMenu` đã có một phần remediation: `createPortal(..., document.body)`, `position: fixed`, `z-index: 9999` và collision detection theo `getBoundingClientRect()`. Tôi giữ nguyên kiến trúc này vì nó đã đáp ứng đúng mô hình tọa độ viewport và không bị lệ thuộc scroll của Canvas.

Global `mousedown` và `keydown` của menu có cleanup đầy đủ. Không phát hiện một listener toàn cục của context menu bị rò.

### 2. Long Table Splitting — không mất dòng / không cắt sai rowspan

`splitTable()` được harden theo hướng đo lại fragment thực thay vì chỉ cộng row height của bảng gốc.

- luôn ép `tableOrphans` tối thiểu 2 dòng cho cả hai phía;
- tôn trọng `rowspan`/`colspan` bằng occupancy map trước khi chọn điểm cắt;
- dùng clone của fragment để browser tự layout lại sau khi bỏ các dòng phía sau; phép đo bao gồm table spacing, cell padding, caption và margin của fragment;
- lặp `<thead>` nguyên bản trên phần nối;
- caption ở phần nối được gắn `(<continuedLabel>)`;
- kiểm tra `headRows + tailRows === originalRows` trước khi trả kết quả và loại `data-sr-id` khỏi phần continuation để outline không trỏ nhầm vào hai fragment.

### 3. Diagram Studio — debounce, stale render và Pan/Zoom

`DiagramDialog` nay debounce render 300ms khi code hoặc spacing thay đổi. SVG cũ được giữ lại trong lúc render mới chạy; chỉ request cuối cùng được phép commit kết quả.

Preview hỗ trợ:

- Ctrl/Cmd + Wheel để zoom theo tâm con trỏ;
- middle-mouse drag hoặc Space + left-drag để pan;
- toolbar `− / % / + / Reset / Fit`;
- viewport đã lưu được khôi phục khi mở lại Studio.

Khi save, pan/zoom được ghi vào metadata `view-x`, `view-y`, `view-zoom`; SVG asset cũng được cập nhật `viewBox` để góc nhìn đã căn chỉnh đi vào bản in thực tế thay vì chỉ tồn tại ở DOM preview.

Mermaid Studio giữ loader/configuration ở module scope và có bounded cache tối đa 64 SVG; renderer chính có bounded cache tối đa 96 SVG. Điều này chặn cache tăng vô hạn khi người dùng chỉnh nhiều sơ đồ độc nhất.

**Lưu ý kiến trúc:** Mermaid 11 trong codebase hiện tại phụ thuộc DOM/SVG runtime, nên không chuyển `mermaid.render()` sang Web Worker. Bản remediation tập trung vào debounce, stale-run cancellation và cache, là thay đổi ít rủi ro hơn mà vẫn loại bỏ nguyên nhân giật lag chính.

### 4. Diagram overflow / `SR-L001`

Trong nhánh atomic overflow, diagram được thử `fit-to-page` trước khi phát cảnh báo. Scale được tính theo cả chiều cao còn lại và chiều rộng khả dụng, đồng thời đặt `width`/`height` cùng tỉ lệ và `aspect-ratio` để tránh méo hình. Caption và margin-bottom được trừ khỏi ngân sách chiều cao.

Chỉ khi sau fit mà block vẫn overflow mới phát `SR-L001`.

### 5. Canvas render cost — 60FPS path

`CanvasPane` không còn subscribe trực tiếp vào `source`/`docId` bằng React selector, nên mỗi ký tự không buộc parent subscribe tree chạy lại theo source.

Một subscription imperative chỉ nhận các thay đổi document đến từ bên ngoài canvas. Thẻ hiện tại được bọc `memo`; callback handlers được giữ trong `useMemo` và đọc action qua stable ref. Vì vậy khi một card thay đổi text, các card không đổi giữ nguyên props/object identity và tránh render lại không cần thiết.

### 6. Async layout / media readiness

Render pipeline chờ:

- Mermaid blocks đã resolve;
- mọi `<img>` hoàn tất load hoặc error;
- `document.fonts.ready`;
- KaTeX/display math đã fit;
- thêm một animation frame cuối trước pagination.

Mỗi render run có `AbortController`. Listener `load/error/abort` của ảnh được tháo khi run bị huỷ, và run cũ không được phép tiếp tục pagination/commit state.

### 7. Event listener / memory leak audit

Đã quét các `window/document/MediaQuery` listeners trong `apps/web` và các package renderer liên quan. Các path `resize`, `keydown`, `keyup`, `mousedown`, `mousemove`, `mouseup`, `wheel`, paste và `afterprint` đều có cleanup trong effect hoặc lifecycle tương ứng.

Các Object URL hiện được revoke theo lifecycle của asset map hoặc timer ngắn sau download. Bổ sung bounded cache cho Mermaid để tránh retention vô hạn.

### 8. Print geometry / theme

`@page` browser print được đặt `margin: 0 !important`; portrait là `210mm 297mm`, landscape là `297mm 210mm`. `html/body` print cũng reset margin/padding.

`.sr-page-shell` dùng kích thước cố định `210mm × 297mm`; paper/ink tokens giữ trắng/đen cho preview/in bất kể application theme.

Các màu hex rời rạc vừa chạm vào trong UI đã chuyển sang CSS token (`--sr-panel`, `--sr-sunk`, `--sr-card`, `--sr-print-paper`, `--sr-print-ink`). Các hex còn lại trong `index.css` chỉ nằm ở phần **định nghĩa token** hoặc data/theme constants, không phải style usage rải rác.

## Parser / state observations

Parser không có vòng lặp không tăng cursor trong các block readers đã rà. `parse()` giữ line/offset theo nguồn sau normalise CRLF; caption attrs và diagram asset metadata được round-trip. Diagram asset parser nay giữ lại `view-x/view-y/view-zoom` để không mất viewport khi serialize lại.

Store có debounce save timer toàn cục theo document. Đây là state-lifetime có chủ đích chứ không phải listener leak; object URLs được gom và revoke khi asset map được refresh.

## Các file đã sửa

- `apps/web/src/components/canvas/CanvasPane.tsx` — giảm render fan-out bằng imperative store subscription + `memo` card + stable action ref; token hóa toast.
- `apps/web/src/components/canvas/CardShell.tsx` — export `CardShellProps` để tách wrapper memo rõ kiểu.
- `apps/web/src/components/canvas/CardEditors.tsx` — truyền viewport pan/zoom vào asset save, áp viewBox, debounce thumbnail render, token hóa panel.
- `apps/web/src/components/canvas/DiagramDialog.tsx` — debounce 300ms, loading giữ SVG cũ, Ctrl/Cmd-wheel, pan, toolbar, restore/save viewport.
- `apps/web/src/components/SideRail.tsx` — token hóa màu tooltip.
- `apps/web/src/hooks/useRender.ts` — AbortController + cleanup media listeners.
- `apps/web/src/index.css` — page shell A4, print tokens, panel/sunk tokens, loại bỏ raw hex usages ở các style vừa audit.
- `apps/web/src/lib/card-forms.ts` — round-trip metadata viewport của diagram asset.
- `apps/web/src/lib/diagram-studio.ts` — lazy Mermaid init/cache, bounded cache, viewport → viewBox.
- `apps/web/src/lib/mermaid.ts` — bounded render cache.
- `packages/layout-engine/src/index.ts` — fit oversized diagram theo width/height/aspect ratio trước `SR-L001`.
- `packages/layout-engine/src/split.ts` — robust table split + exact fragment measurement + row conservation.
- `packages/template-engine/src/css.ts` — explicit physical A4 dimensions and zero print margins.
- `packages/renderer-pdf/src/index.ts` — explicit A4 print page rules/reset margins.
- `scripts/smoke-native-core-interaction.mjs` — cập nhật assertion landscape để khớp physical-mm page sizing mới.
- `docs/SYSTEM-AUDIT-V2.0.md` — báo cáo này.

## Verification

### PASS

`node scripts/smoke-native-core-interaction.mjs` — toàn bộ checks nguồn trong script PASS.

Đã chạy TypeScript bằng compiler global để kiểm tra parse/semantic regression và đối chiếu output với archive gốc. Sau remediation, không xuất hiện diagnostic semantic mới so với baseline archive; lỗi còn lại của compiler trùng baseline và phần lớn bị ảnh hưởng bởi việc môi trường chưa có `node_modules`.

### Không thể thực thi đầy đủ trong container hiện tại

Project khai báo `pnpm@10.34.5`. `pnpm` chưa có trên PATH; Corepack không thể tải package manager từ npm registry do DNS/network (`EAI_AGAIN registry.npmjs.org`). `node_modules` không tồn tại trong archive làm việc.

Vì vậy **chưa thể trung thực tuyên bố `pnpm typecheck` và `pnpm build` PASS** trong môi trường audit này, và browser E2E cũng chưa thể chạy vì Playwright chưa được cài. Source smoke không phụ thuộc dependencies nên đã được chạy thành công.

Lệnh xác nhận tại machine/CI có network:

```bash
corepack pnpm --version
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm smoke
pnpm browser-check
```

## V3 — Root-Cause Investigation & Regression Hardening (18 Sep 2026)

Đợt V3 tập trung vào bốn lỗi tái hiện thực tế được báo cáo sau đợt refactor trước.

### Lỗi 1 — Long table mất tail và caption "Bảng Bảng …"

**Caption duplication — root cause đã xác định ở `packages/renderer-html/src/render-core.ts:30-80`.** `crossRef` tự sinh semantic label bằng `refWord()` + số, trong khi parser có thể trả về một text node đứng ngay trước như `"Bảng "`. Ghép hai node theo renderer cũ tạo đúng chuỗi `"Bảng " + "Bảng 3.2"`.

**Fix:** `inline()` nhận biết cặp `text -> crossRef`; chỉ khi text node kết thúc đúng bằng semantic word của reference thì renderer bỏ word do `crossRef` sinh ra và giữ lại một lần duy nhất. Không dùng replace toàn cục nên các câu không có pattern lặp vẫn nguyên.

**Tail disappearance:** static audit của pipeline cho thấy `paginate()` vốn đã `queue.unshift(tail)`; vì vậy không có bằng chứng rằng `queue` tự ý loại bỏ tail. Điểm yếu thực tế nằm ở việc fragment continuation được clone với cùng `id/data-sr-id/data-sr-block-id` của block gốc và chưa có invariant bảo toàn row ở ranh giới `split -> paginate`. Đây là trạng thái dễ tạo identity collision cho các pass dùng selector/anchor và không có guard chống một fragment hỏng lọt tiếp vào queue.

**Fix:** `splitTable()` nay đo lại clone head sau khi loại row, tính cả margin/caption/table reflow; cấm cắt qua `rowspan`; giữ tối thiểu 2 dòng mỗi phía; lặp `<thead>`; làm sạch identity của tail; đánh dấu `data-sr-continuation=1` và `data-sr-remaining-rows`; loại suffix `(tiếp theo)` cũ trước khi thêm suffix mới; kiểm tra `headRows + tailRows === sourceRows`. `paginate()` kiểm tra lại conservation trước khi `queue.unshift(tail)`. Nếu invariant thất bại, engine khôi phục block nguyên bản thay vì âm thầm làm mất dữ liệu.

**Giới hạn xác minh:** container audit không có `node_modules`/Playwright nên chưa chạy được browser E2E trên chính tài liệu 21 dòng. Vì vậy, phần “tail disappearance” được harden theo invariants và identity semantics; không tuyên bố đã tái hiện được một DOM browser bug duy nhất từ source tĩnh.

### Lỗi 2 — Cell Selection Lock

**Root cause tại `apps/web/src/components/canvas/CardEditors.tsx:379-430`:** `selectedCells` chỉ có các path chọn/drag nội bộ, không có lifecycle reset khi pointer rời khỏi table và không có `Escape` handler cấp component.

**Fix:** thêm `tableEditorRef`, listener `pointerdown` ở capture phase để phát hiện target ngoài editor, và listener `keydown` cho `Escape`; cả hai chỉ được gắn khi có selection và đều có cleanup. Reset đồng thời `selectedCells`, anchor, dragging state.

### Lỗi 3 — Diagram Studio blur + wheel leakage + hướng chữ chìm

**Root cause của blur tại `apps/web/src/components/canvas/DiagramDialog.tsx`:** bản preview cũ scale wrapper HTML bằng CSS `transform: translate(...) scale(zoom)`. SVG vẫn là vector về mặt DOM, nhưng compositor có thể giữ lớp đã rasterize/composite ở mức zoom cũ, tạo cảm giác ảnh bitmap khi phóng lớn.

**Fix:** bỏ CSS scale khỏi preview; zoom/pan bằng thay đổi trực tiếp `viewBox` của `<svg>` qua `applyDiagramViewport()` (`apps/web/src/lib/diagram-studio.ts`). Render asset lưu cũng bake viewport vào SVG để góc nhìn đã chọn đi cùng asset.

Native `wheel` listener `{ passive:false }` trên preview gọi `preventDefault()` + `stopPropagation()` cho Ctrl/Cmd+Wheel, nên không rò sang browser page zoom/canvas scroll. Listener được cleanup theo lifecycle dialog.

Trong quá trình kiểm tra toán học của Pan/Zoom, phát hiện thêm một regression chưa được mô tả: công thức zoom theo cursor của patch trước dùng scale ratio sai dấu/hệ số, và pan pixel không chia cho zoom. V3 sửa cả hai bằng nghịch đảo zoom (`1/Z`) và quy đổi pixel -> percent theo `1/Z`.

Phím Space chỉ kích hoạt `Space+drag` khi focus không nằm trên `input`, `textarea` hoặc contenteditable, tránh biến dấu cách đang gõ trong Mermaid source thành trạng thái pan.

Các nút hướng được đưa về token tương phản sáng trên nền tối qua `.sr-diagram-choice`.

### Lỗi 4 — Print/PDF lệch Preview

**Root cause tại `packages/template-engine/src/css.ts:455-476`:** print root cũ dùng `position:absolute` và `width:max(pageWidth,pageHeight)`. Với A4 portrait, điều này buộc root layout rộng 297mm dù page box là 210mm, nên browser paged-media engine phải shrink/reposition nội dung.

**Fix:** root print trở về `position:static`, width `100%`, xóa margin/padding/min/max width; `.sr-page` được ép trực tiếp đúng kích thước template (`210×297mm` portrait, `297×210mm` landscape). `@page` và named landscape page box đều margin 0. `#root` UI app bị loại khỏi print tree.

`packages/renderer-pdf/src/print.ts` chờ `document.fonts.ready` rồi mới cho browser 2 animation frames áp print stylesheet trước `window.print()`, tránh snapshot khi font metrics còn đổi.

### Proactive audit — hạng mục thêm

- Không phát hiện global `window/document/MediaQuery` listener mới không có cleanup trong các path đã rà.
- `useRender` đã abort render run cũ và tháo image listeners `load/error/abort` của run bị huỷ.
- Mermaid render cache đã bounded; không tăng vô hạn theo số source duy nhất.
- Object URL lifecycle đã có revoke path tập trung; download paths revoke sau thời gian ngắn.
- Parser block readers đã kiểm tra cursor progression; không thấy loop không tăng index trong các reader chính.
- Table/diagram editor serialization giữ `attrsRaw`, caption/label và viewport metadata; không phát hiện regression round-trip mới.
- `store.ts` đã loại bỏ duplicate object key `source` từng tồn tại.
- `splitList()` và `splitCodeBlock()` đã được rà theo cùng tiêu chí row/item conservation, numbering, leading newline và caption continuation; chưa thấy lỗi mới đủ bằng chứng để thay đổi logic ngoài phạm vi.

### Verification V3

**PASS**

- `node scripts/smoke-root-cause-v3.mjs`
- `node scripts/smoke-native-core-interaction.mjs`
- `tsc -p tsconfig.json --noEmit` bằng compiler global: diagnostic code/count trùng baseline v2 trước patch; không xuất hiện error-code semantic mới do V3.

**Bị chặn bởi môi trường**

`pnpm@10.34.5` không có local và Corepack không tải được từ npm registry (`EAI_AGAIN registry.npmjs.org`). Archive cũng không chứa `node_modules`, vì vậy `pnpm install`, `pnpm typecheck`, `pnpm build` và browser E2E/Playwright chưa thể chạy trong container này.

Lệnh xác nhận ở môi trường CI/máy local có network:

```bash
corepack pnpm --version
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm smoke:root-cause
pnpm smoke
pnpm browser-check
```
