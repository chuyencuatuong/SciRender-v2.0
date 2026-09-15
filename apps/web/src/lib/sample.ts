/**
 * Bài mẫu theo đúng quy cách BTL Bách khoa: đủ bìa, phụ bìa, tóm tắt, lời cảm
 * ơn, mục lục, danh mục hình/bảng/từ viết tắt, và một chương nội dung có công
 * thức, bảng, hình, sơ đồ, mã nguồn để thấy toàn bộ cơ chế đánh số hoạt động.
 */
export const SAMPLE_DOCUMENT = `---
title: Ước lượng huyết áp không xâm lấn từ tín hiệu PPG và ECG
template: hcmut-btl
language: vi
date: 09/2026
cover:
  university: Đại học Quốc gia TP. Hồ Chí Minh
  school: Trường Đại học Bách khoa
  faculty: Khoa Khoa học Ứng dụng
  reportType: Báo cáo bài tập lớn
  course: Môn Cơ sở Y khoa
  class: L01
  group: Nhóm 1
  advisor: TS. Nguyễn Văn B
  place: Tp. HCM
  logo: asset:logo-bk
  members:
    - name: Trần Nhật Tường
      mssv: "2210001"
    - name: Nguyễn Văn A
      mssv: "2210002"
    - name: Lê Thị C
      mssv: "2210003"
abstract: |
  Báo cáo khảo sát khả năng ước lượng huyết áp tâm thu và tâm trương từ cặp tín
  hiệu quang thể tích (PPG) và điện tim (ECG) thông qua đặc trưng thời gian
  truyền sóng mạch. Nhóm trích xuất 21 đặc trưng hình thái và thời gian, sau đó
  so sánh ba mô hình hồi quy trên cùng một tập kiểm thử. Kết quả cho thấy sai số
  tuyệt đối trung bình đạt 5,2 mmHg với huyết áp tâm thu, nằm trong ngưỡng chấp
  nhận của chuẩn AAMI.
acknowledgement: |
  Nhóm xin trân trọng cảm ơn thầy hướng dẫn đã góp ý về phương pháp xử lý tín
  hiệu, và cảm ơn phòng thí nghiệm Kỹ thuật Y sinh đã hỗ trợ thiết bị đo tham
  chiếu trong suốt quá trình thực hiện đề tài.
abbreviations:
  - term: PPG
    meaning: Photoplethysmography — quang thể tích ký
  - term: ECG
    meaning: Electrocardiography — điện tâm đồ
  - term: PTT
    meaning: Pulse Transit Time — thời gian truyền sóng mạch
  - term: AAMI
    meaning: Association for the Advancement of Medical Instrumentation
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

# Giới thiệu chung

## Đặt vấn đề

Huyết áp là một trong bốn dấu hiệu sinh tồn cơ bản. Phương pháp đo bằng băng
quấn tuy chính xác nhưng gây khó chịu và không cho phép theo dõi liên tục
[@mukkamala2015]. Hướng tiếp cận không xâm lấn dựa trên thời gian truyền sóng
mạch cho phép ước lượng huyết áp từ hai tín hiệu sinh học dễ thu thập là PPG và
ECG [@elgendi2019].

![Logo Trường Đại học Bách khoa TP.HCM](asset:logo-bk){#fig:logo width=24mm}

## Mục tiêu đề tài

Đề tài hướng tới ba mục tiêu:

1. Xây dựng quy trình trích xuất đặc trưng ổn định từ cặp tín hiệu PPG-ECG.
2. So sánh ba mô hình hồi quy trên cùng một tập kiểm thử.
3. Đối chiếu sai số với ngưỡng cho phép của chuẩn AAMI [@aami2013].

### Phạm vi thực hiện

Nghiên cứu giới hạn ở dữ liệu mô phỏng, chưa thu thập trên người tình nguyện.

\`\`\`mermaid
flowchart TB
  A[PPG + ECG thô] --> B[Lọc băng thông 0.5-8 Hz]
  B --> C[Phát hiện đỉnh R]
  B --> D[Phát hiện chân sóng PPG]
  C --> E[Tính PTT]
  D --> E
  E --> F[Trích 21 đặc trưng]
  F --> G[Mô hình hồi quy]
\`\`\`

: Chuỗi xử lý tín hiệu từ dữ liệu thô đến đầu ra huyết áp {#dia:pipeline}

# Cơ sở lý thuyết

## Quan hệ giữa PTT và huyết áp

Vận tốc sóng mạch liên hệ với mô-đun đàn hồi thành mạch theo phương trình
Moens-Korteweg. Kết hợp với quan hệ giữa mô-đun đàn hồi và áp suất, ta thu được
biểu thức ước lượng huyết áp tâm thu:

$$
SBP = \\frac{a}{PTT^{2}} + b
$$ {#eq:sbp}

trong đó $a$ và $b$ là hai tham số hiệu chuẩn theo từng đối tượng[^hieuchuan]. Từ
@eq:sbp có thể thấy quan hệ giữa huyết áp và PTT là phi tuyến, nên mô hình hồi quy
tuyến tính đơn thuần sẽ chịu sai số hệ thống ở hai đầu dải đo.

[^hieuchuan]: Hiệu chuẩn được thực hiện một lần cho mỗi đối tượng, bằng ba cặp đo
  tham chiếu ở ba mức huyết áp khác nhau.

Thời gian truyền sóng mạch được xác định bằng khoảng cách giữa đỉnh R của ECG và
điểm chân sóng của PPG:

$$
PTT = t_{\\text{foot}}^{PPG} - t_{R}^{ECG}
$$ {#eq:ptt}

## Thông số thiết bị đo

| Thông số | Giá trị | Ghi chú |
|:---------|--------:|:--------|
| Tần số lấy mẫu | 125 Hz | đồng bộ hai kênh |
| Độ phân giải ADC | 16 bit | |
| Dải thông PPG | 0,5 – 8 Hz | lọc Butterworth bậc 4 |

: Thông số thu thập tín hiệu {#tbl:thietbi}

# Phương pháp thực hiện

## Dữ liệu

Tập dữ liệu gồm 1 200 đoạn tín hiệu dài 30 giây. Mỗi đoạn được gán nhãn bằng giá
trị huyết áp tham chiếu đo bằng phương pháp xâm lấn. Thống kê mô tả được trình
bày ở @tbl:dulieu.

| Thuộc tính | Giá trị | Ghi chú |
|:-----------|--------:|:--------|
| Số đối tượng | 84 | 46 nam, 38 nữ |
| Số đoạn tín hiệu | 1200 | 30 s mỗi đoạn |
| SBP trung bình | 121,4 mmHg | độ lệch chuẩn 17,8 |
| DBP trung bình | 68,9 mmHg | độ lệch chuẩn 11,2 |

: Thống kê mô tả tập dữ liệu {#tbl:dulieu}

Bảng @tbl:dactrung liệt kê toàn bộ đặc trưng được trích xuất. Bảng dài hơn phần
trống còn lại của trang nên được cắt sang trang sau, dòng tiêu đề lặp lại[^bangdai].

[^bangdai]: Quy cách của khoa không nói về bảng dài. Cách xử lý ở đây theo thông lệ
  trình bày khoa học: lặp lại dòng tiêu đề và ghi "(tiếp theo)" ở chú thích.

| STT | Đặc trưng | Nguồn | Đơn vị |
|----:|:----------|:------|:-------|
| 1 | PTT trung bình | ECG + PPG | s |
| 2 | PTT độ lệch chuẩn | ECG + PPG | s |
| 3 | Nhịp tim trung bình | ECG | nhịp/phút |
| 4 | Biến thiên nhịp tim SDNN | ECG | ms |
| 5 | Biến thiên nhịp tim RMSSD | ECG | ms |
| 6 | Biên độ đỉnh PPG | PPG | đơn vị tương đối |
| 7 | Thời gian lên sóng PPG | PPG | s |
| 8 | Thời gian xuống sóng PPG | PPG | s |
| 9 | Diện tích dưới sóng PPG | PPG | đơn vị tương đối |
| 10 | Chỉ số tăng cường AI | PPG | % |
| 11 | Độ rộng sóng ở 25% biên độ | PPG | s |
| 12 | Độ rộng sóng ở 50% biên độ | PPG | s |
| 13 | Độ rộng sóng ở 75% biên độ | PPG | s |
| 14 | Tỉ số biên độ đỉnh trên chân | PPG | — |
| 15 | Đạo hàm bậc nhất cực đại | PPG | 1/s |
| 16 | Đạo hàm bậc hai cực đại | PPG | 1/s² |
| 17 | Khoảng RR trung bình | ECG | s |
| 18 | Biên độ sóng R | ECG | mV |
| 19 | Độ rộng phức bộ QRS | ECG | s |
| 20 | Năng lượng băng 0,5–5 Hz | PPG | đơn vị tương đối |
| 21 | Chỉ số chất lượng tín hiệu | ECG + PPG | 0–1 |

: Toàn bộ 21 đặc trưng được trích xuất {#tbl:dactrung}

## Mô hình và hàm mất mát

Ba mô hình được so sánh: hồi quy tuyến tính đa biến, rừng ngẫu nhiên và mạng
nơ-ron một lớp ẩn. Hàm mất mát dùng chung là sai số bình phương trung bình:

$$
\\mathcal{L} = \\frac{1}{N} \\sum_{i=1}^{N} \\left( y_i - \\hat{y}_i \\right)^{2}
$$ {#eq:loss}

\`\`\`python
def pulse_transit_time(ecg_peaks, ppg_feet, fs):
    """Tính PTT trung bình theo từng nhịp, đơn vị giây."""
    pairs = match_beats(ecg_peaks, ppg_feet)
    return [(foot - peak) / fs for peak, foot in pairs]
\`\`\`

: Hàm tính thời gian truyền sóng mạch {#lst:ptt}

Chi tiết cách ghép nhịp được mô tả ở @lst:ptt và minh họa ở @dia:hieuchuan.

\`\`\`mermaid
flowchart TB
  S[5 phép đo đầu] --> H[Ước lượng a, b]
  H --> M[Áp dụng cho toàn bộ đoạn còn lại]
  M --> K[Kiểm thử chéo theo đối tượng]
\`\`\`

: Quy trình hiệu chuẩn theo từng đối tượng {#dia:hieuchuan}

# Kết quả và bàn luận

Sai số tuyệt đối trung bình của ba mô hình được tổng hợp ở @tbl:ketqua.

| Mô hình | MAE SBP (mmHg) | MAE DBP (mmHg) | R² |
|:--------|---------------:|---------------:|---:|
| Hồi quy tuyến tính | 8,7 | 6,1 | 0,61 |
| Rừng ngẫu nhiên | 6,0 | 4,4 | 0,78 |
| Mạng nơ-ron | 5,2 | 3,9 | 0,83 |

: So sánh sai số của ba mô hình trên tập kiểm thử {#tbl:ketqua}

Mạng nơ-ron cho sai số thấp nhất ở cả hai chỉ số. Tuy nhiên chênh lệch so với
rừng ngẫu nhiên là 0,8 mmHg, nhỏ hơn độ phân giải thực tế của thiết bị tham
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
title: TÊN ĐỀ TÀI
template: hcmut-btl
language: vi
date: 09/2026
cover:
  university: Đại học Quốc gia TP. Hồ Chí Minh
  school: Trường Đại học Bách khoa
  faculty: Khoa ...
  reportType: Báo cáo bài tập lớn
  course: Môn ...
  class: L01
  group: Nhóm 1
  advisor:
  place: Tp. HCM
  logo: asset:logo-bk
  members:
    - name:
      mssv: ""
abstract: |
  Trình bày thật cô đọng nội dung và kết quả của công việc mà đề tài thực hiện,
  khoảng 10 đến 20 dòng.
acknowledgement: |
  Nhóm xin trân trọng cảm ơn ...
abbreviations: []
bibliography: []
---

# Giới thiệu chung

## Đặt vấn đề

Bắt đầu viết ở đây.
`;
