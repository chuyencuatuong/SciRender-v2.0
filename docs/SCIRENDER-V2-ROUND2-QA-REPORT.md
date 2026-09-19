# SciRender v2.0 — Round 2 Performance, Lifecycle & Stress Hardening Report

Ngày audit: 19 September 2026

## 1. Phạm vi Đợt 2

Đợt 2 kế thừa trực tiếp workspace đã hoàn thành Đợt 1 và tập trung vào:

- khử jank khi kéo divider editor/preview và divider Split View;
- giảm relayout khi mở/đóng SidePanel;
- cô lập wheel event của PreviewPane và giảm tần suất ghi preference khi zoom bằng wheel;
- kiểm tra/củng cố lifecycle của listener, requestAnimationFrame và Blob/Object URL;
- harden print lifecycle để không có hai phiên print chồng nhau cùng thao tác trên một print root;
- chuẩn bị stress fixture tương đương ít nhất 35 trang để dùng cho Browser/E2E stress pass.

## 2. Root cause performance đã xử lý

| Khu vực | Root cause | Remediation |
|---|---|---|
| Editor/Preview divider | `mousemove` gọi `setPref('editorWidth', ...)` ở mọi event; Zustand + localStorage + React tree bị update liên tục | cache `DOMRect`, tính % bằng ref, cập nhật width trực tiếp trong `requestAnimationFrame`, chỉ commit preference một lần khi `mouseup` |
| Canvas Split View divider | `setSplitPct()` ở mọi `mousemove`, gây rerender CanvasPane trong lúc kéo | chuyển sang imperative width update theo RAF; chỉ commit state khi `mouseup` |
| Split View card animation | mỗi card có Framer Motion layout/entrance animation; Split View nhân đôi DOM card tree | khi Split View active, tắt `layout="position"`, entrance/exit animation và transition của từng card |
| Desktop SidePanel | đóng/mở bằng transition `margin-left` + `opacity`; margin thay đổi layout của toàn bộ canvas trong nhiều frame | layout change xảy ra tức thời; phần nội dung panel chỉ animate bằng compositor `transform/opacity` |
| Preview wheel | React/page-level wheel còn có thể nhận event; Ctrl/Cmd-wheel cũng ghi preference quá dày | mọi wheel stop propagation; chỉ Ctrl/Cmd-wheel preventDefault; zoom cập nhật DOM theo RAF và persist bằng debounce |
| Print lifecycle | nhiều `print()` chồng nhau có thể dùng chung `#sr-print-root`, listener cũ có khả năng cleanup DOM của phiên mới | singleton `activePrintCleanup`; cleanup idempotent và phiên trước được dọn trước khi phiên mới bắt đầu |

## 3. Memory / lifecycle audit

### Listener

Các đường listener mới trong Đợt 2 đều có cleanup:

- editor divider `mousemove`/`mouseup` + pending RAF;
- split divider `mousemove`/`mouseup` + pending RAF;
- PreviewPane `wheel` + pending RAF + debounce timer;
- print `afterprint` cleanup.

Các lifecycle asset đã có từ Đợt 1 tiếp tục được kiểm tra:

- document switch revoke asset URL map cũ;
- addGeneratedAsset revoke map cũ trước khi tạo map mới;
- removeAsset revoke map cũ trước khi tạo map mới;
- renderer PDF revoke Blob URL sau download.

## 4. Stress scenario

Đã tạo:

`scripts/fixtures/stress-35-page.md`

Fixture có:

- 35 trang logic với 34 explicit page breaks;
- ~865 KB dữ liệu Markdown;
- hơn 120 dòng bảng;
- nhiều code block lặp;
- các đoạn văn dài đủ lớn để gây áp lực lên parser/layout/DOM khi chạy browser.

Round-2 smoke kiểm tra đầy đủ các invariant cấu trúc của fixture.

**Giới hạn:** browser E2E stress thực tế trên fixture chưa chạy được trong sandbox vì archive không có `node_modules` và package manager/dependency download bị chặn. Do đó không ghi nhận giả rằng đã đo FPS/heap/DOM thực trên Chromium.

## 5. Verification matrix

| Check | Result |
|---|---|
| `node scripts/smoke-round2.mjs` | PASS — 30/30 |
| `node scripts/smoke-root-cause-v3.mjs` | PASS |
| `node scripts/smoke-native-core-interaction.mjs` | PASS |
| Stress fixture structural checks | PASS |
| Global TypeScript parse attempt | Không phát hiện syntax error mới; bị chặn bởi missing dependencies/module resolution |
| `pnpm typecheck` | Chưa chạy được do thiếu dependency tree/pnpm runtime |
| `pnpm build` | Chưa chạy được do thiếu dependency tree |
| Browser/Playwright E2E | Chưa chạy được do thiếu Playwright/browser dependency trong archive |

Lần thử cài dependency bằng `npm ci --ignore-scripts --no-audit --no-fund` cũng không hoàn tất trong sandbox; không sử dụng kết quả đó để tuyên bố build thành công.

## 6. Files changed in Round 2

### Modified

- `apps/web/src/App.tsx`
- `apps/web/src/components/SidePanel.tsx`
- `apps/web/src/components/PreviewPane.tsx`
- `apps/web/src/components/canvas/CanvasPane.tsx`
- `packages/renderer-pdf/src/print.ts`
- `packages/renderer-pdf/src/index.ts`
- `package.json`

### Added

- `scripts/smoke-round2.mjs`
- `scripts/fixtures/stress-35-page.md`
- `docs/SCIRENDER-V2-ROUND2-QA-REPORT.md`

## 7. Expected runtime effect

Sau Đợt 2, các thao tác có tần suất event cao không còn đi xuyên qua React/Zustand ở từng pointer event:

- divider drag chỉ commit state một lần lúc thả chuột;
- wheel zoom không ghi preference theo từng wheel packet;
- Split View không chạy layout animation cho hàng loạt card khi đang ở chế độ chia đôi;
- desktop SidePanel không còn animate bằng layout-affecting margin transition.

Đây là các thay đổi ở event/render pipeline, không phải tăng timeout hoặc che triệu chứng bằng debounce tùy tiện.

## 8. Release readiness

Workspace hiện giữ toàn bộ thay đổi Đợt 1 + Đợt 2 và đã được đóng gói thành một archive duy nhất.

Trạng thái QA hiện tại:

**Core/source smoke: PASS**

**Runtime build/browser E2E: BLOCKED BY ENVIRONMENT**

Không có claim rằng browser FPS/heap hoặc 35-page DOM pagination đã được đo thực tế trong sandbox này.
