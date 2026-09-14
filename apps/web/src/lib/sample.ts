export const SAMPLE_DOCUMENT = `---
title: Ước lượng huyết áp không xâm lấn từ tín hiệu PPG và ECG
subtitle: Một khảo sát thực nghiệm trên tập dữ liệu mô phỏng
authors:
  - name: Trần Nhật Tường
    affiliation: Khoa Kỹ thuật Y sinh, Trường Đại học Bách khoa TP.HCM
    email: tuong@example.edu.vn
    corresponding: true
  - name: Nguyễn Văn A
    affiliation: Khoa Kỹ thuật Y sinh, Trường Đại học Bách khoa TP.HCM
date: 2026
language: vi
keywords: [huyết áp không xâm lấn, PPG, ECG, PTT, học máy]
abstract: |
  Bài báo khảo sát khả năng ước lượng huyết áp tâm thu và tâm trương từ cặp tín
  hiệu quang thể tích (PPG) và điện tim (ECG) thông qua đặc trưng thời gian
  truyền sóng mạch. Chúng tôi trích xuất 21 đặc trưng hình thái và thời gian,
  sau đó so sánh ba mô hình hồi quy. Kết quả cho thấy sai số tuyệt đối trung
  bình đạt 5.2 mmHg với huyết áp tâm thu, nằm trong ngưỡng chấp nhận của chuẩn
  AAMI.
bibliography:
  - key: mukkamala2015
    authors: Mukkamala R., Hahn J.-O., Inan O. T.
    year: 2015
    title: Toward ubiquitous blood pressure monitoring via pulse transit time
    source: IEEE Transactions on Biomedical Engineering
    volume: "62"
    pages: 1879-1901
    doi: 10.1109/TBME.2015.2441951
  - key: elgendi2019
    authors: Elgendi M., Fletcher R., Liang Y.
    year: 2019
    title: The use of photoplethysmography for assessing hypertension
    source: npj Digital Medicine
    volume: "2"
    pages: "60"
  - key: aami2013
    authors: ANSI/AAMI/ISO
    year: 2013
    title: Non-invasive sphygmomanometers - Part 2
    source: Association for the Advancement of Medical Instrumentation
---

# Giới thiệu

Huyết áp là một trong bốn dấu hiệu sinh tồn cơ bản. Phương pháp đo bằng băng
quấn tuy chính xác nhưng gây khó chịu và không cho phép theo dõi liên tục
[@mukkamala2015]. Hướng tiếp cận không xâm lấn dựa trên thời gian truyền sóng
mạch (*pulse transit time*, PTT) cho phép ước lượng huyết áp từ hai tín hiệu
sinh học dễ thu thập là PPG và ECG [@elgendi2019].

Mục tiêu của nghiên cứu này gồm ba điểm:

1. Xây dựng quy trình trích xuất đặc trưng ổn định từ cặp tín hiệu PPG-ECG.
2. So sánh ba mô hình hồi quy trên cùng một tập kiểm thử.
3. Đối chiếu sai số với ngưỡng cho phép của chuẩn AAMI [@aami2013].

# Cơ sở lý thuyết

## Quan hệ giữa PTT và huyết áp

Vận tốc sóng mạch $PWV$ liên hệ với mô-đun đàn hồi thành mạch theo phương trình
Moens-Korteweg. Kết hợp với quan hệ giữa mô-đun đàn hồi và áp suất, ta thu được
biểu thức ước lượng huyết áp tâm thu:

$$
SBP = \\frac{a}{PTT^{2}} + b
$$ {#eq:sbp}

trong đó $a$ và $b$ là hai tham số hiệu chuẩn theo từng đối tượng. Từ @eq:sbp có
thể thấy quan hệ giữa huyết áp và PTT là phi tuyến, nên mô hình hồi quy tuyến
tính đơn thuần sẽ chịu sai số hệ thống ở hai đầu dải đo.

Thời gian truyền sóng mạch được xác định bằng khoảng cách giữa đỉnh R của ECG và
điểm chân sóng của PPG:

$$
PTT = t_{\\text{foot}}^{PPG} - t_{R}^{ECG}
$$ {#eq:ptt}

## Chuỗi xử lý tín hiệu

\`\`\`mermaid
flowchart LR
  A[PPG + ECG thô] --> B[Lọc băng thông 0.5-8 Hz]
  B --> C[Phát hiện đỉnh R]
  B --> D[Phát hiện chân sóng PPG]
  C --> E[Tính PTT]
  D --> E
  E --> F[Trích 21 đặc trưng]
  F --> G[Mô hình hồi quy]
\`\`\`

: Chuỗi xử lý tín hiệu từ dữ liệu thô đến đầu ra huyết áp {#dia:pipeline}

# Phương pháp

## Dữ liệu

Tập dữ liệu gồm 1 200 đoạn tín hiệu dài 30 giây, tần số lấy mẫu 125 Hz. Mỗi đoạn
được gán nhãn bằng giá trị huyết áp tham chiếu đo bằng phương pháp xâm lấn.

| Thuộc tính | Giá trị | Ghi chú |
|:-----------|--------:|:--------|
| Số đối tượng | 84 | 46 nam, 38 nữ |
| Số đoạn tín hiệu | 1200 | 30 s mỗi đoạn |
| Tần số lấy mẫu | 125 Hz | đồng bộ hai kênh |
| SBP trung bình | 121.4 mmHg | độ lệch chuẩn 17.8 |
| DBP trung bình | 68.9 mmHg | độ lệch chuẩn 11.2 |

: Thống kê mô tả tập dữ liệu sử dụng trong nghiên cứu {#tbl:dataset}

Thống kê mô tả được trình bày trong @tbl:dataset. Phân bố huyết áp tâm thu lệch
nhẹ về phía cao, phù hợp với đặc điểm quần thể bệnh nhân nội trú.

## Mô hình

Ba mô hình được so sánh: hồi quy tuyến tính đa biến, rừng ngẫu nhiên và mạng
nơ-ron một lớp ẩn. Hàm mất mát dùng chung là sai số bình phương trung bình:

$$
\\mathcal{L} = \\frac{1}{N} \\sum_{i=1}^{N} \\left( y_i - \\hat{y}_i \\right)^{2}
$$ {#eq:loss}

::: note Lưu ý về hiệu chuẩn
Mọi kết quả trong bài đều dùng hiệu chuẩn theo đối tượng: hai tham số $a$, $b$
trong @eq:sbp được ước lượng riêng cho từng người từ 5 phép đo đầu tiên.
:::

# Kết quả và bàn luận

Sai số tuyệt đối trung bình của ba mô hình được tổng hợp ở @tbl:results.

| Mô hình | MAE SBP (mmHg) | MAE DBP (mmHg) | R² |
|:--------|---------------:|---------------:|---:|
| Hồi quy tuyến tính | 8.7 | 6.1 | 0.61 |
| Rừng ngẫu nhiên | 6.0 | 4.4 | 0.78 |
| Mạng nơ-ron | 5.2 | 3.9 | 0.83 |

: So sánh sai số của ba mô hình trên tập kiểm thử {#tbl:results}

Mạng nơ-ron cho sai số thấp nhất ở cả hai chỉ số. Tuy nhiên chênh lệch so với
rừng ngẫu nhiên là 0.8 mmHg, nhỏ hơn độ phân giải thực tế của thiết bị tham
chiếu, nên chưa đủ cơ sở kết luận mô hình này vượt trội về mặt lâm sàng.

> Chuẩn AAMI yêu cầu sai số trung bình không vượt quá 5 mmHg và độ lệch chuẩn
> không vượt quá 8 mmHg trên ít nhất 85 đối tượng.

Cả ba mô hình đều chưa đạt đồng thời hai điều kiện trên, chủ yếu do sai số tăng
mạnh ở nhóm đối tượng có huyết áp trên 150 mmHg — đúng như dự đoán từ tính phi
tuyến của @eq:sbp.

# Kết luận

Nghiên cứu cho thấy đặc trưng PTT kết hợp mô hình phi tuyến có thể ước lượng
huyết áp với sai số tiệm cận ngưỡng AAMI. Hướng phát triển tiếp theo là mở rộng
tập dữ liệu ở dải huyết áp cao và khảo sát tính ổn định của hiệu chuẩn theo thời
gian.
`;

export const EMPTY_DOCUMENT = `---
title: Tài liệu mới
authors:
  - name:
abstract: |
  Tóm tắt nội dung nghiên cứu.
keywords: []
---

# Giới thiệu

Bắt đầu viết ở đây.
`;
