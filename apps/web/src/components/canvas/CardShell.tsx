import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Copy,
  GripVertical,
  Rows2,
  Trash2,
  LineChart,
} from 'lucide-react';
import type { BibEntry, LabelRecord } from '@scirender/ast';
import { detectKind, KIND_LABEL, makeColumns, splitColumns, type Card } from '~/lib/cards';
import { CardEditor } from './CardEditors';

export type DropZone = 'above' | 'below' | 'left' | 'right';

interface Props {
  card: Card;
  index: number;
  total: number;
  selected: boolean;
  flash?: boolean;
  dropZone: DropZone | null;
  recognised: string | null;
  /** The document's labelled objects — see `EditorProps.labels`. */
  labels?: Record<string, LabelRecord>;
  bibliography?: BibEntry[];
  onSelect: () => void;
  onDoubleClick?: () => void;
  onChange: (text: string) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCreateChart?: () => void;
  onUnmerge: () => void;
  onMergeWithNext: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (zone: DropZone) => void;
  onDrop: () => void;
  onUndoRecognition: () => void;
  onSaveDiagramAsset?: (svg: string, label: string) => Promise<string>;
  onToggleLandscape?: () => void;
}

const ZONE_RING: Record<DropZone, string> = {
  above: 'after:absolute after:inset-x-2 after:-top-1 after:h-0.5 after:rounded after:bg-sky-500',
  below: 'after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded after:bg-sky-500',
  left: 'after:absolute after:inset-y-2 after:-left-1 after:w-1 after:rounded after:bg-flag-500',
  right: 'after:absolute after:inset-y-2 after:-right-1 after:w-1 after:rounded after:bg-flag-500',
};

/**
 * One block of the document.
 *
 * The row of actions only appears on hover or when the card is selected: with
 * six buttons on every card the column read as a control panel rather than a
 * document. Dragging up or down reorders; dragging onto the left or right edge
 * of another card puts the two side by side, and the target is shown before
 * the drop so the gesture is never a guess.
 */
export function CardShell(props: Props): JSX.Element {
  const { card, index, total, selected, dropZone } = props;
  const [handleDown, setHandleDown] = useState(false);
  const columns = card.kind === 'columns' ? splitColumns(card.text) : null;

  const zoneFromEvent = (e: React.DragEvent<HTMLElement>): DropZone => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.22) return 'left';
    if (x > 0.78) return 'right';
    return e.clientY - r.top < r.height / 2 ? 'above' : 'below';
  };

  return (
    <article
      data-card-index={index}
      draggable={handleDown}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        props.onDragStart();
      }}
      onDragEnd={() => {
        setHandleDown(false);
        props.onDragEnd();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        props.onDragOver(zoneFromEvent(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop();
      }}
      onMouseDown={props.onSelect}
      onDoubleClick={props.onDoubleClick}
      onFocusCapture={props.onSelect}
      data-card-id={card.id}
      data-active={selected}
      className={`sr-card-shell group relative px-3.5 py-3 transition-[border-color,box-shadow,transform] duration-200 ${
        selected ? 'translate-y-[-1px]' : ''
      } ${dropZone ? ZONE_RING[dropZone] : ''} ${
        props.flash ? 'ring-2 ring-sky-400 animate-pulse' : ''
      }`}
    >
      {/* Thanh chỉ dấu bên trái thay cho cái khung: khối phẳng lì cho tới khi
          bạn chạm vào nó. */}
      <span
        aria-hidden="true"
        className={`absolute left-[-2px] bottom-2 top-2 w-[2px] rounded-full bg-sky-500 transition-[opacity,transform] duration-200 ${
          selected ? 'opacity-100' : 'scale-y-50 opacity-0 group-hover:scale-y-100 group-hover:opacity-100'
        }`}
      />

      <header
        className="sr-floating-toolbar pointer-events-none absolute -top-3 right-2 z-20 flex h-[28px] items-center gap-px rounded-full border border-white/10 bg-[#161922]/90 px-1 text-white opacity-0 shadow-lg backdrop-blur-md transition-[opacity,transform] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 data-[on=true]:pointer-events-auto data-[on=true]:opacity-100 dark:text-white"
        data-on={selected}
      >
        <span
          role="button"
          tabIndex={-1}
          aria-label="Kéo để đổi vị trí"
          title="Kéo dọc để đổi thứ tự · kéo sang mép trái/phải khối khác để xếp hai cột"
          onMouseDown={() => setHandleDown(true)}
          onMouseUp={() => setHandleDown(false)}
          className="grid h-[26px] w-[22px] cursor-grab place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </span>
        <span className="mx-0.5 h-[15px] w-px bg-white/15 dark:bg-slate-300" />
        <span className="px-1.5 text-[11.5px] text-white/80">{KIND_LABEL[card.kind]}</span>
        <span className="mx-0.5 h-[15px] w-px bg-white/15 dark:bg-slate-300" />

        {props.recognised ? (
          <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-deep-700">
            nhận dạng: {props.recognised}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-flag-600"
              onClick={props.onUndoRecognition}
            >
              dán dạng văn bản
            </button>
          </span>
        ) : null}

        <div className="flex items-center gap-0.5">
          <IconBtn title="Lên (Alt+↑)" disabled={index === 0} onClick={() => props.onMove(-1)}>
            <ArrowUp size={12} />
          </IconBtn>
          <IconBtn
            title="Xuống (Alt+↓)"
            disabled={index === total - 1}
            onClick={() => props.onMove(1)}
          >
            <ArrowDown size={12} />
          </IconBtn>
          {columns ? (
            <>
              <IconBtn title="Tách thành các khối riêng" onClick={props.onUnmerge}>
                <Rows2 size={12} />
              </IconBtn>
              {props.onToggleLandscape ? (
                <label title="Khổ giấy ngang cho toàn bộ khối Hai cột" className="inline-flex h-[26px] items-center gap-1 rounded-full px-1.5 text-[9px] text-white/70 hover:bg-white/10">
                  <input type="checkbox" checked={/\b(?:landscape|orientation=landscape)\b/.test(card.text)} onChange={props.onToggleLandscape} />
                  ngang
                </label>
              ) : null}
            </>
          ) : (
            <IconBtn
              title="Ghép với khối dưới thành hàng hai cột"
              disabled={index === total - 1}
              onClick={props.onMergeWithNext}
            >
              <Columns2 size={12} />
            </IconBtn>
          )}
          {card.kind === 'table' && props.onCreateChart ? (
            <IconBtn title="Chuyển bảng thành biểu đồ SVG" onClick={props.onCreateChart}>
              <LineChart size={12} />
            </IconBtn>
          ) : null}
          <IconBtn title="Nhân bản (Ctrl+D)" onClick={props.onDuplicate}>
            <Copy size={12} />
          </IconBtn>
          <IconBtn title="Xóa khối" danger onClick={props.onDelete}>
            <Trash2 size={12} />
          </IconBtn>
        </div>
      </header>

      <div className="min-w-0">
        {columns ? (
          <div className="grid grid-cols-2 gap-2">
            {columns.map((part, i) => (
              <div key={i} className="rounded border border-dashed border-ink-200 p-1.5">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-400">
                  cột {i + 1}
                </div>
                <CardEditor
                  kind={detectKind(part)}
                  text={part}
                  labels={props.labels}
                  bibliography={props.bibliography}
                  suppressLandscape
                  onChange={(next) => {
                    const pair = columns.slice() as [string, string];
                    pair[i] = next;
                    props.onChange(makeColumns(pair[0], pair[1], /\b(?:landscape|orientation=landscape)\b/.test(card.text)));
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <CardEditor kind={card.kind} text={card.text} labels={props.labels} bibliography={props.bibliography} onSaveDiagramAsset={props.onSaveDiagramAsset} onChange={props.onChange} />
        )}
      </div>
    </article>
  );
}

function IconBtn({
  title,
  onClick,
  children,
  disabled = false,
  danger = false,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-[26px] w-[26px] place-items-center rounded-full text-white/70 transition disabled:opacity-25 ${
        danger ? 'hover:bg-white/10 hover:text-red-200 dark:hover:bg-red-100 dark:hover:text-red-700' : 'hover:bg-white/10 hover:text-white dark:hover:bg-slate-200 dark:hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
