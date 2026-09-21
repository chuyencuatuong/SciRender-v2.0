# DAY 1 — Tích hợp tài khoản, cổng người dùng, bảo mật (21/09/2026)

## Tóm tắt

| Hạng mục | Trạng thái |
|---|---|
| Đặt file `security.ts`, 4 UI component, dependency | xong |
| `lib/supabase.ts`, `hooks/useAuth.ts` | xong — chạy được cả khi **không có** `.env` (chế độ khách) |
| Hash routing `#app` / `#dashboard` / `#admin` / `/` | xong — mỗi route là một chunk lazy |
| Tự điền bìa BTL từ hồ sơ | xong — chỉ điền ô trống/giữ chỗ (P1), có thông báo trên canvas (P6) |
| Sanitize đường render | xong — **cần thêm profile `document-render`**, xem mục Bảo mật |
| Zero-regression Core Editor | **đã đo**: HTML bản xem trước byte-identical với v2.8 |

## Kết quả kiểm chứng (đo thật)

| Kiểm tra | v2.8 gốc | DAY 1 |
|---|---|---|
| `pnpm typecheck` | 0 lỗi | 0 lỗi |
| `pnpm smoke` | 257/257 | **275/275** (+18 kiểm tra tự điền bìa) |
| `pnpm build` | ✓ | ✓ |
| `pnpm smoke:pagination` | 9/9 | 9/9 |
| `pnpm browser-check` | 54 ok, 2 FAIL, dừng ở bước "Tệp/Xuất" | **giống hệt** (2 FAIL cũ từ Đợt 8, không phải do DAY 1) |
| Bản xem trước bài mẫu (17 trang) — SHA-256 của toàn bộ HTML trang | `a16cecce…fd88f` | `a16cecce…fd88f` (trùng khớp) |
| `pnpm e2e:auth` (Supabase giả lập) | — | **29/29** |

## Bố cục mới

```
apps/web/src/
  App.tsx                    router hash (mới) — AuthProvider + lazy routes
  components/EditorShell.tsx App.tsx cũ, giữ nguyên + 4 bổ sung nhỏ (xem đầu tệp)
  components/{AuthModal,ProfileSetupModal,UserPortal,AdminDashboard}.tsx   (team)
  routes/{Landing,Dashboard,Admin}Route.tsx, RouteChrome.tsx               (nối dây)
  hooks/useAuth.ts           AuthProvider + useAuth (một subscription cho cả app)
  lib/supabase.ts            client, null khi thiếu env
  lib/database.types.ts      kiểu hàng của profiles
  lib/hash-route.ts          parse/navigate/useHashRoute
  lib/profile-cover.ts       hồ sơ → cover: (hàm thuần, có smoke test)
  lib/security.ts            (team) + profile `document-render`
supabase/migrations/
  20260921000000_schema_v1.sql       (team, nguyên văn)
  20260921000100_admin_stats.sql     admin_document_count() + full_name từ Google
```

## Quyết định cần bạn biết

1. **`/` là landing, không ép đăng nhập.** Người dùng cũ mở `/` thấy nút "Vào Editor"; bookmark
   cũ cần thêm `#app`. Chế độ khách giữ nguyên hành vi v2.8.
2. **Tài liệu vẫn lưu IndexedDB.** Bảng `documents` trên Supabase đã có nhưng editor **chưa
   đồng bộ lên**. Cổng người dùng liệt kê tài liệu trên máy này và nói rõ như vậy
   (`UserPortal` có thêm prop `storageMode`, mặc định `'cloud'` giữ thiết kế gốc).
3. **Tự điền bìa — luật ghi:** tài liệu mẫu *nguyên vẹn* (chưa gõ ký tự nào) thì thay danh sách
   thành viên + khoa; mọi tài liệu khác chỉ điền ô trống / `Khoa ...` / `Họ và tên thành viên`,
   và điền MSSV còn trống cho đúng dòng của sinh viên. Không bao giờ ghi đè dữ liệu thật.
   Giá trị ghi dạng chuỗi JSON nên tên chứa `:` `#` `"` hay xuống dòng không phá/chèn YAML.
4. **Ngành (`major`) được ghi vào `cover.major` nhưng chưa in ra.** Mẫu bìa HCMUT theo quy cách
   khoa không có ô "Ngành"; parser hiện bỏ qua khóa này. In ra hay không là quyết định quy cách.
5. **Khoa tự thêm tiền tố "Khoa"** khi hồ sơ ghi thiếu ("Khoa học Ứng dụng" → "Khoa Khoa học Ứng dụng").
6. **Xuất Word** chưa có trong SciRender — nút Word ở cổng người dùng hiện thông báo thay vì lỗi.
   Nút PDF mở editor rồi chạy "In / Lưu PDF" sau khi dựng xong.
7. **Admin xuất CSV** (UTF-8 BOM, Excel mở được tiếng Việt), không phải `.xlsx` — chặn
   formula injection (`=`, `+`, `-`, `@` → thêm `'`).

## Bảo mật — phát hiện quan trọng

**`sanitizeContent(…, 'math-svg')` không dùng được cho đường render.** Đo trên bài mẫu:
xoá 58/58 thuộc tính `data-sr-*` (phân trang dựa vào chúng), 168/168 `style` của KaTeX, và toàn bộ
chữ trong sơ đồ Mermaid (6 249 → 0 ký tự; Mermaid vẽ nhãn trong `<foreignObject>` và dùng
`<style>` trong SVG). `strict-html` còn tệ hơn.

Đã thêm profile **`document-render`** vào `security.ts` (không đổi hai profile cũ): giữ đúng
những gì pipeline sinh ra, chặn `script/iframe/object/embed/form/meta/base/link`, SVG animation,
`feImage`, mọi `on*`, `<use>` ngoài tài liệu, `<style>` ngoài `<svg>`; URL cho phép thêm `blob:`
(ảnh người dùng). 16 payload XSS/mXSS thử trong Chromium: không payload nào chạy.

Đánh đổi: profile này chấp nhận HTML trong `<foreignObject>` (nhãn Mermaid) — thứ `math-svg`
từ chối để chống namespace confusion. Bỏ nó = mọi sơ đồ trống.

Điểm gọi: `useRender.settleMedia` (sink DOM **đầu tiên** — ảnh bắt đầu tải ở đây, không phải ở
PreviewPane), khối phần đầu, trang bìa, `PreviewPane` (memo), xem trước công thức & sơ đồ trong
card. Chi phí ~15 ms/lượt cho 17 trang.

Còn lại, có chủ đích: `lib/mermaid.ts` gán `host.innerHTML = block` **trước** khi sanitize được —
DOMPurify (`SAFE_FOR_XML`) xoá mọi thuộc tính chứa `-->`, tức mã nguồn của mọi flowchart. Chỗ
này dựa vào `escapeAttr` của renderer. `DiagramDialog`/`ChartDialog` chưa sanitize (vẽ lại mỗi
khung hình khi kéo/zoom; cần memo trước).

**CSP trong `security.ts` chưa được áp.** Thử gắn nguyên văn bằng thẻ meta: 43 vi phạm
`style-src`, sơ đồ Mermaid tô đen, và **bài mẫu còn 15 trang thay vì 17** (CSS template chèn
bằng `<style>` bị chặn → phân trang sai). Cần `style-src 'self' 'unsafe-inline'` (hoặc nonce/hash)
trước khi bật, và thêm URL pdf-server vào `connect-src` nếu dùng.

## Schema — nhận xét

- Đúng: RLS bật cả hai bảng, `is_admin()` SECURITY DEFINER trong schema `private` với
  `search_path=''`, `WITH CHECK` chặn sinh viên tự nâng quyền, không có policy INSERT/DELETE profiles.
- `documents` chỉ có policy chủ sở hữu → admin **không đếm được** tổng tài liệu bằng SELECT.
  Đã thêm RPC `admin_document_count()` tự kiểm `is_admin()`.
- Nên cân nhắc: người dùng sửa được `created_at` của chính mình (không nguy hiểm, nhưng có thể
  khoá bằng column-level GRANT); chưa giới hạn độ dài text/jsonb.
- `mermaid@11.4.0` kéo `dompurify@3.1.6` riêng (và `jspdf` kéo `2.5.9`). Có thể ép
  `pnpm.overrides` lên 3.4.15 — chưa làm vì cần kiểm lại Mermaid.

## Chạy E2E với Supabase giả lập

```bash
cd apps/web
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co \
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.fake-anon-key-for-e2e.signature \
pnpm build && pnpm preview        # terminal 1
pnpm e2e:auth                      # terminal 2 (ở gốc repo)
```
Build này chỉ để test — đừng deploy.
