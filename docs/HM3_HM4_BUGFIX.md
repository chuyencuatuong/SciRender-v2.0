# SciRender v2.0 — Hạng mục 3 & 4 Bug Fix

## Lỗi 1 — Quadratic Regression

`packages/figure-engine/src/chart.ts` không còn vẽ mọi đường hồi quy bằng `<line>`.
Đường hồi quy được lấy mẫu 100 điểm trong miền X và sinh thành:

```html
<path d="M ... L ... L ..." fill="none" stroke="#b42318" ... />
```

Số điểm tối thiểu được bảo đảm là 50; mặc định hiện tại là 100.
Trục Y cũng tính cả các giá trị dự đoán của đường hồi quy khi dựng range để parabol không bị cắt khỏi vùng vẽ.

## Lỗi 2 — P1 / Markdown quá dài

Chart mới không còn serialize SVG thành `data:image/svg+xml,...` trong Markdown.
Luồng mới:

```text
SVG string
  ↓
IndexedDB StoredAsset (image/svg+xml)
  ↓
asset:<generated-name>
  ↓
Markdown Figure ngắn
```

Ví dụ Markdown mới:

```markdown
![Đặc tuyến V-A](asset:chart-ohm){#fig:ohm width=100%}
```

`figure-engine` tiếp tục dùng `AssetMap` hiện có để resolve asset khi render. Bundle/export hiện tại vì thế cũng mang theo SVG cùng tài liệu.

`svgDataUri()` vẫn được giữ để tương thích ngược và cho preview/test, nhưng không còn được gọi khi tạo chart mới.

## File thay đổi

- `packages/figure-engine/src/chart.ts`
- `apps/web/src/state/store.ts`
- `apps/web/src/components/canvas/ChartDialog.tsx`
- `apps/web/src/components/canvas/CanvasPane.tsx`
- `scripts/smoke.ts`

## Kiểm tra đã thực hiện

- TypeScript syntax/transpile check cho toàn bộ file TS/TSX thay đổi: PASS.
- Runtime smoke riêng cho SVG generator: PASS.
- Quadratic regression sinh 99 đoạn `L` từ 100 mẫu và không còn regression `<line>`: PASS.
- Markdown figure bằng asset reference dài 43 ký tự trong smoke case: PASS.
- Không còn đường gọi `svgDataUri(svg)` từ UI tạo chart.

Full monorepo `pnpm typecheck/build` cần được chạy trong môi trường có `pnpm` và `node_modules` của dự án; sandbox hiện không có dependency install và bị chặn truy cập registry.
