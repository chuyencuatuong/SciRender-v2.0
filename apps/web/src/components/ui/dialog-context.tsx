import { createContext, useContext, type ExoticComponent, type ReactNode } from 'react';
import type { AuditDialogProps } from '~/components/AuditDialog';
import type { ChartDialogProps } from '~/components/canvas/ChartDialog';
import type { DiagramDialogProps } from '~/components/canvas/DiagramDialog';
import type { SourceDialogProps } from '~/components/canvas/SourceDialog';

export type DialogComponent<Props> = ExoticComponent<Props>;

export interface LazyDialogComponents {
  AuditDialog: DialogComponent<AuditDialogProps>;
  DiagramDialog: DialogComponent<DiagramDialogProps>;
  SourceDialog: DialogComponent<SourceDialogProps>;
  ChartDialog: DialogComponent<ChartDialogProps>;
}

const LazyDialogContext = createContext<LazyDialogComponents | null>(null);

export function LazyDialogProvider({
  children,
  dialogs,
}: {
  children: ReactNode;
  dialogs: LazyDialogComponents;
}): JSX.Element {
  return <LazyDialogContext.Provider value={dialogs}>{children}</LazyDialogContext.Provider>;
}

export function useLazyDialogs(): LazyDialogComponents {
  const value = useContext(LazyDialogContext);
  if (!value) throw new Error('SciRender: LazyDialogProvider ontbreekt.');
  return value;
}
