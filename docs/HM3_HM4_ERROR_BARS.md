# SciRender v2.0 — HM3/HM4 Error Bars

## Phạm vi

Bổ sung thanh sai số đối xứng `y ± Δy` cho Scatter Plot và Line Chart.

## Hình thức dữ liệu

- Mỗi điểm có thể mang `yError` riêng.
- `renderChartSvg()` cũng nhận `yErrors[]` để truyền một vector sai số đã chuẩn bị sẵn.
- UI `ChartDialog` hỗ trợ hai chế độ:
  - Lấy `Δy` từ một cột của bảng.
  - Dùng một giá trị `Δy` cố định cho toàn bộ điểm.

## SVG

Mỗi error bar gồm:

1. Một đoạn thẳng đứng từ `y - Δy` tới `y + Δy`.
2. Hai nắp ngang, rộng tổng cộng khoảng 6 px.

Trục Y được tính lại từ toàn bộ các đầu mút `y - Δy` và `y + Δy` trước khi scale SVG, vì vậy error bars không tràn khỏi vùng plot.

## Tương thích

- Không thêm thư viện biểu đồ ngoài.
- Chart vẫn là SVG thuần.
- Không thay đổi format Markdown nguồn.
- Giữ nguyên các sửa lỗi HM3/HM4 trước đó, bao gồm quadratic regression bằng `<path>` và chart asset reference.
