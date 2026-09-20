import type { BibEntry, LabelRecord } from '@scirender/ast';
import type { CardKind } from '~/lib/cards';

export interface EditorProps {
  kind: CardKind;
  text: string;
  onChange: (text: string) => void;
  /** The document's labelled objects — threaded down to AutoTextarea. */
  labels?: Record<string, LabelRecord>;
  bibliography?: BibEntry[];
  onSaveDiagramAsset?: (svg: string, label: string) => Promise<string>;
  suppressLandscape?: boolean;
}
