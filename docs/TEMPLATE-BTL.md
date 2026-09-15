# Template `hcmut-btl` — đối chiếu với quy cách khoa ban hành

Bảng dưới đối chiếu từng điều khoản trong *"Phụ lục: Mẫu trình bày file Word chung cho BTL"*
với giá trị thật trong `packages/template-engine/src/templates.ts`. Mục đích là để bạn
(hoặc thầy hướng dẫn) kiểm tra được, thay vì phải tin.

Mỗi dòng đều có một kiểm tra tương ứng trong `scripts/smoke.ts`; chạy `pnpm smoke` là
xác nhận lại toàn bộ bảng này.

## Trang giấy

| Quy cách | Giá trị trong template |
|---|---|
| A4 210×297mm, in một mặt | `page.width: 210mm`, `page.height: 297mm` |
| Lề trái 2,5cm | `page.margin.left: 25mm` |
| Lề phải / trên / dưới 1,5cm | `15mm` cho cả ba |
| Footer cách đáy 0,5cm | `page.footerFromBottom: 5mm` |
| Số trang canh giữa cuối trang | `layout.pageNumberPosition: footer-center` |
| Không dùng Header | app không sinh phần đầu trang nào |

**Một điểm vênh trong chính tài liệu gốc**: hình minh họa trang bìa ghi *0,6cm*, còn
điều 2.2 ghi *0,5cm*. Template lấy **0,5cm** theo điều khoản, và giá trị này chỉnh được
trong panel Template nếu khoa bạn yêu cầu khác.

## Kiểu chữ

| Quy cách | Giá trị |
|---|---|
| Times New Roman toàn bộ | `typography.bodyFont` bắt đầu bằng `"Times New Roman"` |
| Nội dung 13pt | `bodySize: 13pt` |
| Nội dung giãn dòng 1.5 | `lineHeight: 1.5` |
| Nội dung before 10pt, after 0pt | `spaceBefore: 10pt`, `spaceAfter: 0pt` |
| Không thụt đầu dòng | `paragraphIndent: 0mm` |

## Đề mục

| Cấp | Quy cách | `headings.levels[i]` |
|---|---|---|
| H1 | 14pt, đậm, IN HOA, before 24pt, after 24pt, single, canh trái, "CHƯƠNG 1." | `size 14pt · weight 700 · uppercase · 24pt/24pt · lineHeight 1 · numberFormat "CHƯƠNG {n}."` |
| H2 | 13pt, đậm, before 6pt, after 12pt, single | `size 13pt · weight 700 · 6pt/12pt` |
| H3 | 13pt, đậm + nghiêng | `weight 700 · italic` |
| H4 | 13pt, nghiêng | `weight 400 · italic` |
| — | Tối đa 4 chữ số | `numberDepth: 4` |

Mỗi CHƯƠNG bắt đầu trên một trang mới (`pageBreakBefore: true`), đúng như bố cục bài mẫu.

## Chú thích và đánh số

| Quy cách | Giá trị |
|---|---|
| Caption 13pt, before 0, after 0, single, canh giữa | `captions.fontSize: 1em`, `align: center` |
| Chú thích hình đặt dưới | `figurePosition: below` |
| Chú thích bảng đặt trên | `tablePosition: above` |
| Hình 1.1, Bảng 2.1 — đánh số theo chương | `numbering.figures/tables: section`, `resetAtDepth: 1` |
| Danh mục giãn dòng 1.15 | `frontMatter.listLineHeight: 1.15` |

Khối mã có chú thích được đánh số thành **Mã nguồn 3.1** — không nằm trong quy cách gốc
nhưng theo cùng nguyên tắc, và tắt được bằng cách bỏ dòng chú thích.

Khối mã được **tô màu cú pháp** khi bạn ghi tên ngôn ngữ sau ba dấu nháy. Quy cách của
khoa viết cho bản in trắng đen nên không nói gì về màu; bảng màu ở đây chọn sao cho mỗi
loại token ra một mức xám khác nhau khi in. Tắt ở panel **Template → Khối mã → Tô màu cú
pháp** nếu thầy hướng dẫn yêu cầu mã thuần đen.

## Cấu trúc tài liệu

Thứ tự 9 phần trong điều 1.1 được dựng tự động:

| # | Phần | Nguồn dữ liệu |
|---|---|---|
| 1 | Bìa | `cover:` trong front matter |
| 2 | Phụ bìa | `cover.members` |
| 3 | Tóm tắt bài báo cáo | `abstract:` |
| 4 | Lời cảm ơn | `acknowledgement:` |
| 5 | Mục lục | sinh tự động từ đề mục |
| 6 | Danh mục hình / bảng / từ viết tắt | sinh tự động, chỉ in khi ≥ 3 mục |
| 7 | Nội dung (Chương 1…) | thân tài liệu |
| 8 | Tài liệu tham khảo | `bibliography:` |
| 9 | Phụ lục | viết như một chương bình thường |

Ngưỡng "≥ 3 mục" lấy theo tiêu đề trang mẫu (*"nếu nhiều hơn 2 hình"*). Điều 1.1 lại ghi
*"nếu có nhiều hơn 1"* — hai chỗ trong tài liệu gốc không khớp nhau. Đổi ngưỡng bằng
`frontMatter.sections[].minItems`.

## Đánh số trang

| Quy cách | Giá trị |
|---|---|
| Bìa và phụ bìa không đánh số | trang `kind: cover` không có footer |
| Phần đầu i, ii, iii từ trang TÓM TẮT | `layout.frontPageNumbers: roman-lower` |
| Phần nội dung 1, 2, 3 liên tục tới hết | `layout.bodyPageNumbers: arabic` |

Mục lục hiển thị số La Mã cho các danh mục và số thường cho các chương — khớp đúng
trang thật, vì số trang được lấy sau khi phân trang rồi lặp lại tới khi ổn định.

## Trích dẫn

Kiểu số `[1]`, đánh theo thứ tự xuất hiện lần đầu, danh mục liệt kê theo đúng thứ tự đó.
Định dạng dòng tham khảo theo mẫu APA trong tài liệu gốc; đổi sang IEEE bằng
`citation.references: 'ieee'`.

## Bảng dài, hình lớn, chú thích chân trang

| Tình huống | Cách xử lý |
|---|---|
| Bảng dài hơn phần trống còn lại | cắt giữa hai dòng, lặp lại dòng tiêu đề, chú thích trang sau ghi "(tiếp theo)". Mỗi bên giữ tối thiểu `layout.tableOrphans` dòng, nếu không thì đẩy nguyên bảng sang trang mới |
| Danh sách dài | cắt giữa hai mục; `<ol>` phần tiếp được đánh số tiếp, không quay về 1 |
| Ảnh cao hơn vùng nội dung | thu vừa chiều cao trang, chừa chỗ cho chú thích — ảnh **không bao giờ** bị cắt đôi |
| Sơ đồ cao hơn vùng nội dung | thu vừa cả hai chiều, tự đổi chiều nếu vừa hơn, cảnh báo `SR-L003` khi vẫn quá nhỏ |
| Chú thích chân trang | in ở chân **đúng trang có tham chiếu**, có đường kẻ ngăn, 10pt |

## Kiểm tra độ dài 15–30 trang

Điều 1.2.2 được kiểm tra thật, không phải để bạn tự đếm: `layout.pageBudget` của mẫu BTL
đặt `{ min: 15, max: 30 }`, tính trên **phần nội dung** (không tính bìa và phần đầu).
Thanh trạng thái hiện `nội dung 18/15–30 trang · đạt`, và panel Chẩn đoán báo `SR-L010`
(thiếu) hoặc `SR-L011` (vượt).

App **không** tự co giãn để chạm mốc — nó chỉ báo (P1).

## Những gì template **không** tự làm thay bạn

- **Không tự viết nội dung.** Tóm tắt, lời cảm ơn, nội dung chương đều do bạn viết.
- **Không tự sửa lỗi trình bày.** Thiếu chú thích bảng, nhảy cấp đề mục, tham chiếu chết
  đều bị báo trong panel Chẩn đoán chứ không bị lặng lẽ vá.
- **Không in bìa lên giấy màu.** Đó là việc của tiệm in.
