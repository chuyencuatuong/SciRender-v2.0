import {
  Bold,
  Code2,
  Hash,
  Image,
  Italic,
  Link2,
  Quote,
  Sigma,
  Table2,
  Workflow,
} from 'lucide-react';

interface Props {
  onInsert: (text: string, caretOffset?: number) => void;
}

const EQUATION = '\n$$\n\\frac{a}{b} = c\n$$ {#eq:ten-nhan}\n';
const TABLE =
  '\n| Cột A | Cột B | Cột C |\n|:------|------:|:-----:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\n: Chú thích bảng {#tbl:ten-nhan}\n';
const FIGURE = '\n![Chú thích hình](asset:ten-anh){#fig:ten-nhan width=80%}\n';
const MERMAID =
  '\n```mermaid\nflowchart LR\n  A[Đầu vào] --> B[Xử lý]\n  B --> C[Kết quả]\n```\n\n: Chú thích sơ đồ {#dia:ten-nhan}\n';

export function SnippetBar({ onInsert }: Props): JSX.Element {
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-ink-200 bg-ink-50/60 px-2">
      <Btn title="Đề mục" onClick={() => onInsert('\n## ')}>
        <Hash size={14} />
      </Btn>
      <Btn title="Đậm" onClick={() => onInsert('**$SEL**', 2)}>
        <Bold size={14} />
      </Btn>
      <Btn title="Nghiêng" onClick={() => onInsert('*$SEL*', 1)}>
        <Italic size={14} />
      </Btn>
      <Sep />
      <Btn title="Công thức nội dòng" onClick={() => onInsert('$$SEL$', 1)}>
        <span className="font-mono text-[12px] font-semibold">$x$</span>
      </Btn>
      <Btn title="Khối công thức có đánh số" onClick={() => onInsert(EQUATION)}>
        <Sigma size={14} />
      </Btn>
      <Sep />
      <Btn title="Bảng có chú thích" onClick={() => onInsert(TABLE)}>
        <Table2 size={14} />
      </Btn>
      <Btn title="Hình từ tài nguyên" onClick={() => onInsert(FIGURE)}>
        <Image size={14} />
      </Btn>
      <Btn title="Sơ đồ Mermaid" onClick={() => onInsert(MERMAID)}>
        <Workflow size={14} />
      </Btn>
      <Sep />
      <Btn title="Tham chiếu chéo" onClick={() => onInsert('@fig:ten-nhan')}>
        <span className="font-mono text-[12px] font-semibold">@ref</span>
      </Btn>
      <Btn title="Trích dẫn" onClick={() => onInsert('[@khoa-trich-dan]')}>
        <span className="font-mono text-[12px] font-semibold">[@]</span>
      </Btn>
      <Sep />
      <Btn title="Liên kết" onClick={() => onInsert('[$SEL](https://)', 1)}>
        <Link2 size={14} />
      </Btn>
      <Btn title="Trích dẫn khối" onClick={() => onInsert('\n> ')}>
        <Quote size={14} />
      </Btn>
      <Btn title="Khối mã" onClick={() => onInsert('\n```\n$SEL\n```\n')}>
        <Code2 size={14} />
      </Btn>
      <Btn title="Khung ghi chú" onClick={() => onInsert('\n::: note Tiêu đề\nNội dung ghi chú.\n:::\n')}>
        <span className="font-mono text-[12px] font-semibold">:::</span>
      </Btn>

      <span className="ml-auto pr-1 text-[10.5px] text-ink-400">Scientific Markdown</span>
    </div>
  );
}

function Btn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="grid h-7 min-w-[28px] place-items-center rounded px-1 text-ink-500 transition hover:bg-white hover:text-sci-600"
    >
      {children}
    </button>
  );
}

function Sep(): JSX.Element {
  return <span className="mx-1 h-4 w-px bg-ink-200" />;
}
