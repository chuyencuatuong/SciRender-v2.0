# SciRender 2.0

[![CI](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/ci.yml)
[![Deploy](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/chuyencuatuong/SciRender-v2.0/actions/workflows/deploy-pages.yml)

**Scientific Document Intelligence Studio** — *Write science once. Render it professionally everywhere.*

SciRender không phải trình soạn thảo AI, cũng không phải bản sao của Word. Nó là một
**trình biên dịch tài liệu khoa học**: nội dung có cấu trúc đi qua một pipeline cố định
và cho ra tài liệu chuẩn mực, nhất quán, sẵn sàng in.

Template mặc định là **`hcmut-btl`** — dựng đúng quy cách Báo cáo Bài tập lớn của Trường
Đại học Bách khoa TP.HCM: bìa, phụ bìa, tóm tắt, lời cảm ơn, mục lục, danh mục hình/bảng/
từ viết tắt, đánh số i–ii–iii cho phần đầu và 1–2–3 cho phần nội dung. Xem
[docs/TEMPLATE-BTL.md](docs/TEMPLATE-BTL.md) để đối chiếu từng điều khoản.

Toàn bộ ứng dụng chạy trong trình duyệt. Không backend, không database, không API trả phí,
không tài khoản. Mở bằng `file://` hay host tĩnh đều được.

---

## Chạy thử

Yêu cầu Node ≥ 18.18 và **pnpm** (các package nội bộ khai báo bằng giao thức
`workspace:*`, npm và yarn classic không hiểu giao thức này — chạy `npm install`
sẽ dừng lại kèm hướng dẫn).

```bash
corepack enable        # Node 18+ đã có sẵn corepack; hoặc: npm i -g pnpm
pnpm install
pnpm dev               # http://localhost:5173
```

```bash
pnpm build       # bundle tĩnh vào apps/web/dist
pnpm preview     # phục vụ bản build tại http://localhost:4173
pnpm typecheck   # tsc --noEmit cho toàn bộ workspace
pnpm smoke       # 224 kiểm tra pipeline thuần (không cần trình duyệt)
```

Kiểm tra tầng cần DOM (phân trang, orphan/widow, KaTeX, Mermaid):

```bash
pnpm exec playwright install chromium   # playwright đã nằm trong devDependencies
pnpm build && pnpm preview              # cửa sổ 1
pnpm browser-check                      # cửa sổ 2 — 113 kiểm tra
```

---

## CI và triển khai

Hai workflow trong `.github/workflows/`:

| Workflow | Chạy khi | Làm gì |
|----------|----------|--------|
| `ci.yml` | push lên `main`, mọi pull request, hoặc bấm tay | Job **verify**: `typecheck` → `smoke` → `build`, tải `apps/web/dist` lên artifact. Job **browser**: cài Chromium, build, dựng preview rồi chạy `browser-check`, tải ảnh chụp trang lên artifact. Hai job chạy song song. |
| `deploy-pages.yml` | push lên `main`, hoặc bấm tay | Build với `VITE_BASE=/<tên-repo>/` rồi đẩy lên GitHub Pages. |

**Trước khi `deploy-pages.yml` chạy được lần đầu**, vào
**Settings → Pages → Build and deployment → Source** và chọn **GitHub Actions**.
Nếu để nguyên "Deploy from a branch" thì workflow sẽ fail ở bước `configure-pages`.

`base` của Vite lấy từ biến môi trường `VITE_BASE` (mặc định `/`), nên chỉ workflow Pages
mới đổi đường dẫn asset — `pnpm dev`, `pnpm preview` và host tĩnh thường vẫn chạy ở `/`.

CI dùng `pnpm install --frozen-lockfile`: sửa `package.json` mà quên commit
`pnpm-lock.yaml` thì CI sẽ fail ngay ở bước cài, cố ý như vậy.

---

## Bảy nguyên tắc và chỗ chúng được thực thi

| | Nguyên tắc | Được thực thi ở đâu |
|---|---|---|
| **P1** | Content Integrity | Parser chỉ *cấu trúc hóa*, không viết lại. TeX, mã nguồn, văn bản được mang nguyên văn. `table-engine` đệm ô thiếu **trên bản sao để render**, AST gốc không đổi. Khóa front matter lạ được giữ trong `meta.extra`. |
| **P2** | Deterministic Rendering | Parser, validator, intelligence, renderer đều là hàm thuần: không đồng hồ, không ngẫu nhiên, không I/O. Node id sinh từ `hash(type, dòng, cột, thứ tự)`. Chữ ký đầu vào hiện ở thanh trạng thái — cùng chữ ký ⇒ cùng bố cục. `scripts/smoke.ts` và `browser-check.mjs` đều khẳng định lại điều này. |
| **P3** | AST First | `@scirender/ast` là nguồn dữ liệu duy nhất. HTML và PDF là *đầu ra*, không bao giờ là nguồn. Đánh số nằm trên AST chứ không nằm trong HTML. |
| **P4** | Separation of Concerns | Mỗi package là một chặng và chỉ phụ thuộc chặng trước nó. Phân trang tách hẳn khỏi `compile()` vì nó cần DOM thật. |
| **P5** | Local First | `@scirender/storage` dùng IndexedDB cho tài liệu + ảnh, LocalStorage cho tùy chọn giao diện. Không có một lệnh gọi mạng nào lúc chạy. |
| **P6** | Fail Loudly | Mọi vấn đề thành một `Diagnostic` có mã (`SR-P010`, `SR-V012`…), vị trí dòng và gợi ý sửa. Công thức LaTeX hỏng hiện ra hộp đỏ; tham chiếu không phân giải hiện gạch chân đỏ. Không có chỗ nào "sửa ẩu". |
| **P7** | Research by Consent | `@scirender/telemetry` không được package nào khác import. Mặc định OFF. Bật lên vẫn chỉ ghi vào LocalStorage và lọc bỏ mọi trường có thể chứa nội dung; muốn dùng thì người dùng tự bấm xuất tệp. Tắt đi là xóa sạch. |

---

## Pipeline

```
Nguồn (Scientific Markdown)
   │
   ├─► parser ──────────► Document AST  ← P3: nguồn dữ liệu duy nhất
   │                          │
   │      template-engine ────┤  resolveTemplate(descriptor, overrides)
   │                          │
   ├─► assignNumbers ─────────┤  đánh số mục / công thức / hình / bảng,
   │                          │  phân giải @ref và [@citation]
   ├─► validator ─────────────┤  → Diagnostic[]
   ├─► intelligence ──────────┤  → Document Health Score
   └─► renderer-html ─────────┘  → mảng khối HTML
                              │
                   layout-engine (cần DOM)
                              │  phân trang, keep-with-next, orphan/widow
                              ▼
                     Trang A4 trên màn hình
                              │
                     renderer-pdf → window.print() / HTML độc lập
```

`compile()` trong `apps/web/src/lib/pipeline.ts` chạy toàn bộ phần thuần và đo thời gian
từng chặng (hiện ở thanh trạng thái). Phân trang, sơ đồ Mermaid và phần đầu chạy riêng
trong `useRender` vì chúng cần DOM thật.

**Không còn live render.** Gõ chữ không dựng lại trang; bấm **Dựng trang** hoặc
<kbd>Ctrl</kbd>+<kbd>Enter</kbd> mới dựng. Lý do: phân trang phải đo hộp dòng thật của
trình duyệt, chạy việc đó sau mỗi phím gõ là nguyên nhân giật lag. Thanh trạng thái báo
"chưa dựng lại" khi bản xem trước đã cũ hơn nội dung trên canvas.

Mục lục cần một **điểm bất động**: nó hiển thị số trang, mà thêm nó vào lại làm đổi số
trang phần đầu. `useRender` lặp tối đa ba lượt và dừng ngay khi các số thôi đổi.

---

## Cấu trúc kho

```
scirender/
├─ apps/web/                  Giao diện (React 18 + Vite + Tailwind) — block canvas
│  ├─ public/fonts/           3 mặt chữ .woff2 tự lưu, có đủ dấu tiếng Việt
│  └─ src/styles/fonts.css    @font-face kèm unicode-range (latin / latin-ext / vietnamese)
├─ packages/
│  ├─ ast/                    Kiểu dữ liệu AST, Diagnostic, tiện ích duyệt cây
│  ├─ parser/                 Scientific Markdown → AST (front matter, khối, nội dòng)
│  ├─ validator/              Luật cấu trúc / cú pháp / tài nguyên
│  ├─ intelligence/           Document Health Score + gợi ý
│  ├─ template-engine/        Descriptor → CSS + số đo; đánh số; phân giải tham chiếu
│  ├─ layout-engine/          Phân trang, cắt đoạn theo dòng, orphan/widow
│  ├─ renderer-html/          AST → HTML (thuần, không DOM)
│  ├─ renderer-pdf/           In / xuất PDF qua native browser print, xuất HTML độc lập
│  ├─ equation-engine/        Bọc KaTeX + đánh số công thức
│  ├─ figure-engine/          Phân giải `asset:`, kiểm tra hình
│  ├─ table-engine/           Chuẩn hóa bảng, căn cột
│  ├─ storage/                IndexedDB + LocalStorage + bundle xuất/nhập
│  └─ telemetry/              Tầng nghiên cứu opt-in, cô lập hoàn toàn (P7)
├─ templates/scientific-standard/
└─ scripts/                   smoke.ts (pipeline), browser-check.mjs (DOM)
```

Các package được dùng **trực tiếp ở dạng mã nguồn TypeScript** (`main: src/index.ts`);
Vite biên dịch chúng qua alias trong `vite.config.ts`, TypeScript qua `paths` trong
`tsconfig.base.json`. Không có bước build trung gian, HMR xuyên suốt từ app vào package.
Khi cần publish riêng (hoặc khi thêm backend Typst ở Phase 3), mỗi package đã có ranh
giới sẵn để thêm `tsup`.

Kiểm chứng đã chạy trên cây kho này: `pnpm typecheck` sạch, `pnpm smoke` 224/224,
`pnpm browser-check` 113/113, `pnpm build` thành công. `browser-check` chạy thật cả việc
tải PDF: nó bấm nút Xuất, hứng tệp tải về rồi đọc `/MediaBox` để chắc mỗi trang đúng khổ A4
và đúng số trang như bản xem trước.

---

## Cú pháp Scientific Markdown

Xem [docs/SYNTAX.md](docs/SYNTAX.md) cho bản đầy đủ. Tóm tắt:

````markdown
---
title: Tiêu đề bài báo
authors:
  - name: Trần Nhật Tường
    affiliation: HCMUT
    email: a@b.vn
    corresponding: true
keywords: [a, b]
abstract: |
  Tóm tắt 150–250 từ.
bibliography:
  - key: smith2020
    authors: Smith J.
    year: 2020
    title: Một bài báo
    source: Nature
---

# Mục cấp 1

Văn bản có công thức nội dòng $E = mc^2$, trích dẫn [@smith2020],
và tham chiếu tới @eq:nangluong, @fig:sodo, @tbl:ketqua.

$$
E = mc^2
$$ {#eq:nangluong}

![Chú thích hình](asset:so-do){#fig:sodo width=80%}

| Cột A | Cột B |
|:------|------:|
| 1     | 2     |

: Chú thích bảng {#tbl:ketqua}

::: note Ghi chú
Khung ghi chú.
:::
````

---

## Mã chẩn đoán

| Tiền tố | Chặng | Ví dụ |
|---------|-------|-------|
| `SR-P0xx` | Parser | `SR-P010` khối `$$` không đóng, `SR-P020` dòng bảng lệch số ô |
| `SR-V0xx` | Validator | `SR-V008` nhảy cấp đề mục, `SR-V012` nhãn không tồn tại, `SR-V021` lỗi LaTeX |
| `SR-F0xx` | Tài nguyên | `SR-F002` không tìm thấy ảnh `asset:` |
| `SR-T0xx` | Bảng | `SR-T002` bảng thiếu chú thích |
| `SR-L0xx` | Bố cục | `SR-L001` khối cao hơn vùng nội dung trang, `SR-L003` sơ đồ phải thu quá nhỏ mới vừa trang |

Bấm vào một chẩn đoán sẽ nhảy con trỏ tới đúng dòng nguồn. Bấm vào bất kỳ khối nào trên
trang xem trước cũng vậy.

---

## Giao diện

Ba khu, mỗi khu một việc:

| Khu | Nội dung |
|---|---|
| Dock trái 56px | bảy bảng bên (dàn ý, chẩn đoán, sức khỏe, tài nguyên, mẫu, thư viện, dữ liệu) |
| Thanh trên 60px | tên tài liệu · thẻ trạng thái lưu · **Dựng trang** · menu **Tệp** · nút chẻ **Xuất** |
| Cột giữa | block canvas — tài liệu dưới dạng card |
| Cột phải | trang A4 thật trên nền xám, đúng thứ sẽ in ra, kèm đảo thu phóng nổi |
| Thanh dưới | số trang · số từ · hạn mức trang của quy cách · nút **Chi tiết kỹ thuật** |

**Hệ thiết kế.** Nền ngà, bề mặt trắng nổi bằng bóng đổ hai lớp thay cho khung viền, chỉ
tuyến hairline `rgba(15,23,42,.07)` ở chỗ thật sự phải chia ranh. Màu vẫn là bảng màu Bách
khoa: xanh đậm `#0b2c7f`, xanh trời `#1a8fe3`, đỏ `#d62828` dành riêng cho lỗi.

**Ba mặt chữ, cả ba có dấu tiếng Việt, cả ba nằm trong app.** Be Vietnam Pro cho giao diện,
Literata cho tiêu đề, JetBrains Mono cho mã và số. Chúng được `@font-face` từ
`public/fonts/` với `unicode-range` tách riêng phần `vietnamese`, nên trình duyệt chỉ tải
phần chữ cần đến và app không gọi ra mạng lần nào (P5). Cập nhật bằng `pnpm fonts`.

**Khổ màn hình.** Dưới 1180px bản in trượt lên thành lớp phủ, có nút chuyển *Soạn / Bản in*
ở thanh công cụ và một lối **← Soạn thảo** ngay trong đầu bản in. Dưới 1000px bảng bên nổi
lên trên canvas kèm lớp mờ, bấm ra ngoài là đóng.

**Chi tiết kỹ thuật tắt mặc định.** Thời gian từng chặng pipeline, chữ ký đầu vào và thời
gian dựng trang là thứ để soi khi nghi ngờ, không phải thứ nhìn suốt ngày — bật khi cần,
lựa chọn được nhớ lại.

**Nút trên thanh header gom còn ba.** Bảy nút cạnh nhau thì không nút nào nổi bật; giờ chỉ
việc làm liên tục (Dựng trang) là nút, còn lại vào menu Tệp và Xuất. Menu dùng được bằng
bàn phím: ↑↓ chọn, Enter, Esc.

**In và tải PDF là hai việc khác nhau, nên là hai lệnh khác nhau.**

| Lệnh | Phím | Kết quả |
|---|---|---|
| **Tải PDF về máy** (bấm thẳng nút Xuất) | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | tệp `.pdf` rơi vào thư mục Tải về, khổ A4 và lề đã đúng, không phải chỉnh gì trong hộp thoại. Chữ trong tệp là **ảnh**. |
| **Tải PDF nét cao** | — | như trên, gấp rưỡi độ nét, tệp nặng và lâu hơn |
| **In…** | <kbd>Ctrl</kbd>+<kbd>P</kbd> | mở hộp thoại in của trình duyệt; chọn "Save as PDF" nếu cần PDF **chọn được chữ** và tìm kiếm được |

Nút Xuất hiện tiến độ `Đang tạo PDF 7/16` trong lúc dựng, vì mỗi trang phải chụp lại một
lần — tài liệu 16 trang mất khoảng nửa phút trên máy tầm trung.

Chuyển sang mẫu có trang bìa (như `hcmut-btl`) mà tài liệu chưa có khối `cover:` thì khối
đó được **thêm tự động** với đúng chữ của khoa và logo có sẵn — chỉ thêm khi thiếu, không
đụng vào bất kỳ khóa nào đã có (P1), và app nói rõ là nó vừa thêm.

Chuyển động: chỉ 140–180ms cho menu, thêm/xóa/đổi chỗ card và thanh chi tiết. Hệ điều hành
bật "giảm chuyển động" thì tắt hết.

---

## Block canvas — cột giữa

Tài liệu hiện ra thành một cột **card**, mỗi khối một card: đề mục, đoạn văn, công thức,
hình, bảng, sơ đồ, khối mã, chú thích chân trang.

| Thao tác | Cách làm |
|---|---|
| Đổi thứ tự | kéo tay nắm ⠿ lên/xuống, hoặc <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> |
| Xếp hai khối cạnh nhau | kéo một card sang **mép trái/phải** của card khác, hoặc nút ⧉ |
| Thêm khối | menu **Thêm khối** — có ô tìm kiếm, gõ không dấu vẫn ra (`cong thuc` → Công thức); khối hay dùng được ghim lên đầu |
| Nhân bản / xóa | nút trên đầu card, hoặc <kbd>Ctrl</kbd>+<kbd>D</kbd> |
| Hoàn tác | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> |
| Xem Markdown | nút **Mã nguồn** — sửa và Áp dụng cũng được |

**Card là lát cắt của Markdown, không phải một mô hình tài liệu thứ hai.** Mỗi card giữ
đúng đoạn văn bản mà parser đã đọc, và ghép các card lại thì ra đúng tệp cũ. Nhờ vậy canvas
không thể trôi lệch khỏi thứ đem đi in (P1, P3) — có kiểm tra khứ hồi trong `pnpm smoke`.

### Dán thông minh (Ctrl+V)

Bấm vào một card rồi <kbd>Ctrl</kbd>+<kbd>V</kbd>:

| Nội dung trong clipboard | Kết quả |
|---|---|
| Ảnh chụp màn hình | lưu thành tài nguyên, tạo khối Hình kèm ô chú thích và số |
| Vùng chọn từ Excel / bảng HTML | lưới dữ liệu khoa học, giữ nguyên từng ô |
| CSV / TSV | như trên, hiểu cả dấu nháy kép của CSV |
| Mã LaTeX | khối công thức, xem trước KaTeX ngay trong card |
| Đoạn code | khối mã, tự đoán ngôn ngữ để tô màu |
| Mã Mermaid | khối sơ đồ |
| Văn bản thường | đoạn văn |

Nhận dạng chỉ **bọc** văn bản, không sửa một ký tự nào (P1), và luôn hiện nhãn "nhận dạng:
…" kèm nút **dán dạng văn bản** để hoàn tác (P6). Đang gõ dở trong một ô đã có chữ thì
<kbd>Ctrl</kbd>+<kbd>V</kbd> dán thường như mọi trình soạn thảo — trừ ảnh, ảnh thì luôn
thành khối Hình.

---

## Giới hạn đã biết

Nói thẳng, để khỏi mất thời gian phát hiện lại:

- **Bố cục hai cột không cân cột.** Layout engine đổ đầy cột trái rồi mới sang cột phải;
  nó không làm phẳng hai cột ở trang cuối như tạp chí thật.
- **Hình vẫn không cắt qua trang** (đúng ý), nhưng một hình cao hơn trang sẽ bị **thu nhỏ**
  để vừa, chứ app không tự tách hình.
- **Chưa import `.docx` / `.bib`.** Nhập chỉ nhận Markdown và bundle của chính SciRender.
- **Chưa có mục lục cho phụ lục riêng** và chưa có tham chiếu chéo tới số trang.
- **Xuất PDF dùng native print engine của trình duyệt.** SciRender đưa đúng các trang đã
  phân vào DOM + print CSS và để trình duyệt tạo PDF, vì vậy văn bản có text layer, có thể
  bôi đen / Ctrl+F và các thành phần vector có thể được giữ nguyên. Trình duyệt vẫn quyết
  định hộp thoại lưu và đích PDF; chọn **Save as PDF** trong hộp thoại in để tải tệp.
- Dữ liệu nằm trong IndexedDB của **một trình duyệt trên một máy**. Xóa dữ liệu duyệt web
  là mất. Dùng nút **Bundle** để sao lưu.

---

## Lộ trình

- **Phase 2 — đã xong**: block canvas (card kéo thả, chia hai cột), smart paste theo loại
  nội dung, cắt bảng qua trang, footnote, trích dẫn author-year, phân trang hai cột thật.
  Còn lại của Phase 2: import `.docx` / `.bib`.
- **Phase 3** — backend Typst thay cho Paged Media để kiểm soát bố cục ở mức nhà in;
  `renderer-pdf` đã tách sẵn để thay thế mà không đụng tới AST hay template.

---

## Giấy phép

Chưa chọn. Thêm `LICENSE` trước khi công bố.
