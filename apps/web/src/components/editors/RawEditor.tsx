import type { EditorProps } from './types';
import { AutoTextarea } from '../canvas/AutoTextarea';

export function RawEditor({ text, onChange, kind, labels, bibliography }: EditorProps): JSX.Element {
  return (
    <AutoTextarea
      value={text}
      onChange={onChange}
      ariaLabel={`Nội dung khối ${kind}`}
      placeholder="Nội dung… (gõ @ để chèn tham chiếu, [@ để chèn trích dẫn, / để chèn nhanh khối khác)"
      labels={labels}
      bibliography={bibliography}
    />
  );
}
