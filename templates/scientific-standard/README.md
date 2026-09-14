# scientific-standard

Template mặc định của SciRender: A4, chữ serif 13pt, giãn dòng 1.5.

Template là **dữ liệu**, không phải mã. Toàn bộ quyết định trình bày nằm trong một
đối tượng `TemplateDescriptor` và được `@scirender/template-engine` biên dịch
thành CSS + các số đo mà layout engine dùng. Cùng một descriptor luôn cho ra cùng
một stylesheet (P2 — Deterministic Rendering).

## Cách thêm template mới

1. Sao chép `template.json` và sửa giá trị.
2. Thêm descriptor vào `packages/template-engine/src/templates.ts` trong mảng
   `BUILTIN_TEMPLATES`.
3. Không cần sửa parser, renderer hay layout engine — chúng chỉ đọc descriptor.

## Trường quan trọng

| Nhóm | Ý nghĩa |
|------|---------|
| `page` | Khổ giấy, lề, số cột |
| `typography` | Font, cỡ chữ, giãn dòng, canh đều |
| `headings` | Tỉ lệ cỡ chữ theo cấp, quy tắc đánh số |
| `numbering` | Kiểu đánh số công thức / hình / bảng, mốc reset |
| `labels` | Từ ngữ hiển thị: "Hình", "Bảng", "Tài liệu tham khảo"… |
| `captions` | Vị trí chú thích (trên/dưới), dấu phân cách |
| `layout` | `orphans`, `widows`, giữ đề mục với nội dung kế tiếp |
| `citation` | Kiểu trích dẫn và ký tự bao |
