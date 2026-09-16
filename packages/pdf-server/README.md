# @scirender/pdf-server

Máy chủ nhỏ, không trạng thái, làm đúng một việc: nhận HTML đã dựng sẵn
(pages đã phân trang, CSS `@page` của template), in bằng Chromium headless
(`page.pdf()`), trả về tệp PDF **chữ thật** — chọn được, tìm kiếm được,
giống hệt như bấm In… → Save as PDF trong trình duyệt, nhưng tự động.

Không database, không lưu tệp, không log nội dung tài liệu. Một yêu cầu
HTTP vào, một tệp PDF ra.

## Vì sao cần máy chủ này

`packages/renderer-pdf` (nút "Tải PDF" cũ) dùng `html2canvas` + `jsPDF`:
chụp từng trang thành ảnh JPEG rồi nhét vào PDF — nhanh, không cần mạng,
nhưng chữ trong tệp **là ảnh**, không chọn/tìm được. Đó là giới hạn của
chính hai thư viện đó, không phải lỗi có thể vá.

Máy chủ này thay bằng đúng engine PDF của Chromium — engine mà người dùng
đã tin tưởng mỗi khi in trang web. Nó cần một máy chủ vì Chromium headless
không chạy được trong trình duyệt của người dùng.

## Chạy thử ở máy local

```bash
cd packages/pdf-server
npm install
npm run dev          # http://localhost:8787
```

Gửi thử:

```bash
curl -X POST http://localhost:8787/export-pdf \
  -H "Content-Type: application/json" \
  -d '{"html":"<!doctype html><html><head><style>@page{size:210mm 297mm;margin:0}</style></head><body><h1>Xin chào</h1></body></html>"}' \
  --output test.pdf
```

## API

`POST /export-pdf`

Body JSON: `{ "html": "<!doctype html>…" }` — một tài liệu HTML độc lập
đầy đủ (tự chứa CSS, phông chữ nhúng base64 nếu cần). Chính là những gì
`exportStandaloneHtml()` trong `@scirender/renderer-pdf` đã tạo ra.

Header tuỳ chọn `x-export-token`: bắt buộc nếu biến môi trường
`EXPORT_TOKEN` được đặt ở máy chủ.

Trả về: `application/pdf` (nhị phân) khi thành công, hoặc JSON
`{ "error": "..." }` kèm mã lỗi HTTP khi thất bại.

`GET /health` — kiểm tra sống, trả `{ ok, inFlight, queued }`.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `8787` | Cổng lắng nghe |
| `ALLOWED_ORIGIN` | `*` | Origin CORS được phép gọi (đặt đúng domain app khi triển khai thật) |
| `EXPORT_TOKEN` | (trống) | Nếu đặt, mọi yêu cầu phải gửi header `x-export-token` trùng giá trị này |
| `MAX_CONCURRENT_RENDERS` | `2` | Số phiên Chromium chạy song song tối đa — máy nhỏ nên để thấp |

## Triển khai

Xem `render.yaml` ở gốc kho — chạy `render blueprint` hoặc "New →
Blueprint" trên Render.com, trỏ vào kho GitHub này. Dockerfile dùng thẳng
ảnh nền chính thức `mcr.microsoft.com/playwright:v1.48.2-jammy` nên không
cần bước `playwright install` — Chromium có sẵn, khớp đúng phiên bản.

Bậc miễn phí của Render đủ dùng cho quy mô cá nhân/nhóm nhỏ: máy chủ ngủ
sau ~15 phút không có yêu cầu, lần gọi đầu sau đó chờ khoảng 30-60 giây để
thức dậy. Nếu lượng dùng tăng (nhiều học sinh xuất PDF cùng lúc), nâng lên
gói trả phí thấp nhất để máy chủ không ngủ và có nhiều RAM hơn cho
Chromium.

Sau khi có URL, đặt `VITE_PDF_SERVER_URL` trong `apps/web/.env` (xem
`.env.example`) trỏ tới `<url-máy-chủ>/export-pdf`, và đặt `EXPORT_TOKEN`
trùng nhau ở cả máy chủ lẫn app (xem `apps/web/src/lib/export-fonts.ts` /
`TopBar.tsx`).

## Giới hạn đã biết

- Không hàng đợi bền (Chromium đơn tiến trình, giới hạn `MAX_CONCURRENT_RENDERS`
  song song) — đủ cho vài chục người dùng đồng thời, không phải hạ tầng cho
  hàng nghìn yêu cầu/giây.
- Không lưu lịch sử xuất — nếu sau này cần "xem lại các PDF đã xuất", đó là
  một tính năng khác (cần database), xem ghi chú trong tài liệu bàn giao dự án.
