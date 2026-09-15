# Templates

Mỗi tệp `template.json` ở đây là **bản xuất** của một `TemplateDescriptor` trong
`packages/template-engine/src/templates.ts`, sinh lại từ chính mã nguồn nên không bao giờ
lệch với thứ app đang chạy. Chúng để đọc và đối chiếu, không phải để app nạp lúc chạy.

| Thư mục | Dùng cho |
|---|---|
| `hcmut-btl/` | Báo cáo Bài tập lớn — Trường Đại học Bách khoa TP.HCM (mặc định) |
| `scientific-standard/` | Báo cáo khoa học chung, không bìa, không phần đầu |
| `ieee-like/` | Hai cột kiểu hội nghị |

Đối chiếu từng điều khoản của mẫu BTL: [../docs/TEMPLATE-BTL.md](../docs/TEMPLATE-BTL.md).

## Thêm template mới

1. Sao chép một descriptor trong `templates.ts`, đổi giá trị.
2. Thêm vào mảng `BUILTIN_TEMPLATES`.
3. Không cần sửa parser, renderer hay layout engine — chúng chỉ đọc descriptor.

Những gì descriptor điều khiển: khổ giấy và lề, font và giãn dòng, style riêng cho từng
cấp đề mục (cỡ, đậm, nghiêng, in hoa, cách trước/sau, có sang trang mới hay không), quy
tắc đánh số, vị trí và kiểu chú thích, orphan/widow, bìa, các mục phần đầu, cách đánh số
trang cho phần đầu và phần nội dung, cấu hình sơ đồ khối và khối mã, kiểu trích dẫn.
