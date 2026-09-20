import type { CanvasPaneProps } from './CanvasPaneController';
import { useCanvasController } from './CanvasPaneController';
import { CanvasPaneView } from './CanvasPaneView';

export type { CanvasPaneProps, ViewSwitch } from './CanvasPaneController';

export function CanvasPane(props: CanvasPaneProps): JSX.Element {
  const controller = useCanvasController(props);
  return <CanvasPaneView controller={controller} />;
}
