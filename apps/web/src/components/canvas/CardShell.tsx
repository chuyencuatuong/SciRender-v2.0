import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Copy,
  GripVertical,
  Rows2,
  Trash2,
} from 'lucide-react';
import { KIND_LABEL, splitColumns, type Card } from '~/lib/cards';
import { CardEditor } from './CardEditors';

export type DropZone = 'above' | 'below' | 'left' | 'right';

interface Props {
  card: Card;
  index: number;
  total: number;
  selected: boolean;
  dropZone: DropZone | null;
  recognised: string | null;
  onSelect: () => void;
  onChange: (text: string) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUnmerge: () => void;
  onMergeWithNext: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (zone: DropZone) => void;
  onDrop: () => void;
  onUndoRecognition: () => void;
}

const ZONE_RING: Record<DropZone, string> = {
  above: 'before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:bg-sky-500',
  below: 'after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-sky-500',
  left: 'before:absolute before:inset-y-0 before:-left-1 before:w-0.5 before:bg-flag-500',
  right: 'after:absolute after:inset-y-0 after:-right-1 after:w-0.5 after:bg-flag-500',
};

/**
 * One block of the document.
 *
 * Dragging up or down reorders; dragging onto the left or right edge of another
 * card puts the two side by side in a `::: cols` row. The drop target is
 * decided from where the pointer is, and shown before the drop happens, so the
 * gesture is never a guess the user has to undo.
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
      className={`relative rounded-md border bg-white transition ${
        selected ? 'border-sky-400 shadow-[0_0_0_2px_rgba(26,143,227,0.18)]' : 'border-ink-200'
      } ${dropZone ? ZONE_RING[dropZone] : ''}`}
    >
      <header className="flex h-7 items-center gap-1 border-b border-ink-100 bg-ink-50/60 px-1.5">
        <span
          role="button"
          tabIndex={-1}
          aria-label="Kéo để đổi vị trí"
          title="Kéo dọc để đổi thứ tự · kéo sang mép trái/phải khối khác để xếp hai cột"
          onMouseDown={() => setHandleDown(true)}
          onMouseUp={() => setHandleDown(false)}
          className="cursor-grab text-ink-400 hover:text-deep-600 active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </span>
        <span className="text-[11px] font-medium text-ink-600">{KIND_LABEL[card.kind]}</span>
        <span className="text-[10px] text-ink-400">dòng {card.line}</span>

        {props.recognised ? (
          <span className="ml-1 inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-deep-700">
            nhận dạng: {props.recognised}
            <button
              type="button"
              className="underline hover:text-flag-600"
              onClick={props.onUndoRecognition}
            >
              dán dạng văn bản
            </button>
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-0.5">
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
            <IconBtn title="Tách thành hai khối riêng" onClick={props.onUnmerge}>
              <Rows2 size={12} />
            </IconBtn>
          ) : (
            <IconBtn
              title="Ghép với khối dưới thành hàng hai cột"
              disabled={index === total - 1}
              onClick={props.onMergeWithNext}
            >
              <Columns2 size={12} />
            </IconBtn>
          )}
          <IconBtn title="Nhân bản (Ctrl+D)" onClick={props.onDuplicate}>
            <Copy size={12} />
          </IconBtn>
          <IconBtn title="Xóa khối" danger onClick={props.onDelete}>
            <Trash2 size={12} />
          </IconBtn>
        </div>
      </header>

      <div className="px-2.5 py-2">
        {columns ? (
          <div className="grid grid-cols-2 gap-2">
            {columns.map((part, i) => (
              <div key={i} className="rounded border border-dashed border-ink-200 p-1.5">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-400">
                  cột {i + 1}
                </div>
                <CardEditor
                  kind="paragraph"
                  text={part}
                  onChange={(next) => {
                    const pair = columns.slice() as [string, string];
                    pair[i] = next;
                    props.onChange(`::: cols\n${pair[0].trim()}\n|||\n${pair[1].trim()}\n:::`);
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <CardEditor kind={card.kind} text={card.text} onChange={props.onChange} />
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
      className={`grid h-5 w-5 place-items-center rounded text-ink-400 transition hover:bg-white disabled:opacity-30 ${
        danger ? 'hover:text-flag-600' : 'hover:text-deep-600'
      }`}
    >
      {children}
    </button>
  );
}
