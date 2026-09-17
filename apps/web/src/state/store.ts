import { create } from 'zustand';
import {
  DEFAULT_PREFERENCES,
  assetNameFromFile,
  deleteAsset,
  deleteDocument,
  getDocument,
  listAssets,
  listDocuments,
  loadPreferences,
  newId,
  putAsset,
  putDocument,
  savePreferences,
  toAssetMap,
  type Preferences,
  type StoredAsset,
  type StoredDocument,
} from '@scirender/storage';
import { initTelemetry, setEnabled as setTelemetryEnabled, track } from '@scirender/telemetry';
import { findTemplate, type TemplateOverrides } from '@scirender/template-engine';
import { needsCover, withCover } from '~/lib/cover';
import { BUILTIN_ASSETS } from '~/lib/builtin-assets';
import { SAMPLE_DOCUMENT, EMPTY_DOCUMENT } from '~/lib/sample';

export type PanelId =
  | 'outline'
  | 'objects'
  | 'diagnostics'
  | 'health'
  | 'assets'
  | 'template'
  | 'library'
  | 'research';

/** Toàn bộ bảng màu (Tailwind + `--sr-*`) đọc theo `data-theme` trên `<html>` —
 * xem `index.css`/`tailwind.config.js`. Đặt ở đây (không phải component) vì cần
 * áp dụng cả lúc khởi động lẫn mỗi lần đổi. */
function applyTheme(theme: Preferences['theme']): void {
  try {
    document.documentElement.dataset.theme = theme;
  } catch {
    /* SSR/test env không có document — bỏ qua, không phải việc phải chặn app */
  }
}

export interface AppState {
  ready: boolean;
  docId: string;
  title: string;
  /** What the editor holds right now. */
  source: string;
  /** What the preview was last built from. Live render was removed on purpose. */
  renderedSource: string;
  /** Bumped on every explicit render request. */
  renderNonce: number;
  templateId: string;
  overrides: TemplateOverrides;
  assets: StoredAsset[];
  assetMap: Record<string, string>;
  library: StoredDocument[];
  prefs: Preferences;
  panel: PanelId;
  /** Side panel visible. The dock tab toggles it. */
  panelOpen: boolean;
  /** Errors + warnings, mirrored here so the dock can badge without the render. */
  diagnosticCount: number;
  dirty: boolean;
  savedAt: number | null;
  storageError: string | null;
  /** Line the editor should scroll to; bumped by diagnostics/outline clicks. */
  gotoLine: { line: number; nonce: number } | null;
  /** Timestamp of the last automatic cover insertion — the canvas announces it. */
  coverAdded: number | null;
  /** Bumped to ask TopBar's print flow to run — see `requestPrint`. */
  printNonce: number;
  /** Set by the Command Palette; `CanvasPane` owns the actual insert (its
   * card array is local state, not in this store) and watches the nonce. */
  insertBlockRequest: { templateId: string; nonce: number } | null;

  init: () => Promise<void>;
  setSource: (source: string) => void;
  /** Commit the editor content to the preview. */
  render: () => void;
  setPanel: (panel: PanelId) => void;
  setPanelOpen: (open: boolean) => void;
  setDiagnosticCount: (n: number) => void;
  setTemplateId: (id: string) => void;
  setOverrides: (patch: TemplateOverrides) => void;
  resetOverrides: () => void;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  save: () => Promise<void>;
  createDocument: (withSample?: boolean) => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  /** Stores the files and returns the asset names they got. */
  addAssets: (files: FileList | File[]) => Promise<string[]>;
  removeAsset: (id: string) => Promise<void>;
  requestGotoLine: (line: number) => void;
  /** Remembers which block template was just inserted, for "Hay dùng". */
  noteBlockUsed: (id: string) => void;
  refreshLibrary: () => Promise<void>;
  /** Asks TopBar to run its print flow (Ctrl+P and the toolbar button do the
   * same) — from anywhere, e.g. the Command Palette, without a second copy
   * of `onPrint`'s print-dialog logic (P4). */
  requestPrint: () => void;
  /** Asks `CanvasPane` to append one block, by `CardTemplate` id — what the
   * Command Palette's "Chèn khối" actions call. */
  requestInsertBlock: (templateId: string) => void;
  /**
   * Renames a labelled object's id in the Markdown source itself (P1: the
   * source stays the only truth, nothing is renamed only "in the UI").
   * Rewrites the `{#kind:old}` definition on the object's own line and every
   * `@kind:old` reference elsewhere — both always written with the full
   * "kind:id" form the parser produces once the label is registered
   * (`normalised` in the numbering pass), so a plain literal swap is safe.
   * Returns false (and changes nothing) when the definition could not be
   * found on its own line, so the caller can tell the user rather than
   * silently leave references pointing at a name nothing defines.
   */
  renameLabel: (oldFull: string, newFull: string, definitionLine: number) => boolean;
}

let revokeAssets: (() => void) | null = null;
let saveTimer: number | null = null;

function titleFromSource(source: string): string {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(source);
  if (fm) {
    const m = /^title:\s*(.+)$/m.exec(fm[1] ?? '');
    if (m) return (m[1] ?? '').trim().replace(/^["']|["']$/g, '') || 'Tài liệu chưa đặt tên';
  }
  const h = /^#\s+(.+)$/m.exec(source);
  if (h) return (h[1] ?? '').trim();
  return 'Tài liệu chưa đặt tên';
}

/** Escapes a literal string for use inside a `new RegExp(...)`. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  docId: '',
  title: 'Tài liệu chưa đặt tên',
  source: '',
  renderedSource: '',
  renderNonce: 0,
  templateId: 'hcmut-btl',
  overrides: {},
  assets: [],
  assetMap: { ...BUILTIN_ASSETS },
  library: [],
  prefs: { ...DEFAULT_PREFERENCES },
  panel: 'diagnostics',
  panelOpen: true,
  diagnosticCount: 0,
  dirty: false,
  savedAt: null,
  storageError: null,
  gotoLine: null,
  coverAdded: null,
  printNonce: 0,
  insertBlockRequest: null,

  async init() {
    const prefs = loadPreferences();
    initTelemetry(prefs.telemetryOptIn);
    applyTheme(prefs.theme);
    set({ prefs });
    try {
      const library = await listDocuments();
      const wanted = prefs.lastDocumentId
        ? library.find((d) => d.id === prefs.lastDocumentId)
        : library[0];
      if (wanted) {
        set({ library });
        await get().openDocument(wanted.id);
      } else {
        set({ library });
        await get().createDocument(true);
      }
    } catch (err) {
      // Private mode or a blocked IndexedDB: keep working in memory (P6 — say so).
      set({
        storageError:
          'Không truy cập được IndexedDB nên phiên làm việc này sẽ không được lưu tự động. ' +
          `Chi tiết: ${(err as Error).message}`,
        docId: newId('doc'),
        source: SAMPLE_DOCUMENT,
        renderedSource: SAMPLE_DOCUMENT,
        renderNonce: 1,
        title: titleFromSource(SAMPLE_DOCUMENT),
      });
    }
    set({ ready: true });
  },

  setSource(source) {
    set({ source, title: titleFromSource(source), dirty: true });
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void get().save();
    }, 900);
  },

  render() {
    set((s) => ({ renderedSource: s.source, renderNonce: s.renderNonce + 1 }));
    track('render.request', { bytes: get().source.length });
  },

  setPanelOpen(panelOpen) {
    set({ panelOpen });
  },

  setDiagnosticCount(diagnosticCount) {
    if (get().diagnosticCount !== diagnosticCount) set({ diagnosticCount });
  },

  setPanel(panel) {
    set({ panel });
    track('panel.open', { panel });
  },

  setTemplateId(templateId) {
    // A cover template with no cover data printed an empty first page and left
    // the writer to guess the YAML. Switching now brings the block with it —
    // only when the document does not already have one (P1).
    const template = findTemplate(templateId);
    const source = get().source;
    const filled = needsCover(source, template) ? withCover(source, template) : source;
    if (filled !== source) {
      set({ source: filled, coverAdded: Date.now() });
    }
    set((s) => ({ templateId, dirty: true, renderNonce: s.renderNonce + 1 }));
    track('template.change', { templateId });
    void get().save();
  },

  setOverrides(patch) {
    const merged: TemplateOverrides = { ...get().overrides };
    for (const [key, value] of Object.entries(patch)) {
      const current = (merged as Record<string, unknown>)[key];
      (merged as Record<string, unknown>)[key] =
        current && typeof current === 'object' && value && typeof value === 'object'
          ? { ...(current as object), ...(value as object) }
          : value;
    }
    set((s) => ({ overrides: merged, dirty: true, renderNonce: s.renderNonce + 1 }));
    void get().save();
  },

  resetOverrides() {
    set((s) => ({ overrides: {}, dirty: true, renderNonce: s.renderNonce + 1 }));
    void get().save();
  },

  setPref(key, value) {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    savePreferences(prefs);
    if (key === 'telemetryOptIn') setTelemetryEnabled(Boolean(value));
    if (key === 'theme') applyTheme(value as Preferences['theme']);
  },

  async save() {
    const { docId, title, source, templateId, overrides, storageError } = get();
    if (!docId || storageError) return;
    const existing = await getDocument(docId).catch(() => undefined);
    const now = Date.now();
    try {
      await putDocument({
        id: docId,
        title,
        source,
        templateId,
        overrides: overrides as Record<string, unknown>,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      set({ dirty: false, savedAt: now });
      await get().refreshLibrary();
    } catch (err) {
      set({ storageError: `Lưu thất bại: ${(err as Error).message}` });
    }
  },

  async createDocument(withSample = false) {
    const id = newId('doc');
    const source = withSample ? SAMPLE_DOCUMENT : EMPTY_DOCUMENT;
    revokeAssets?.();
    revokeAssets = null;
    set((s) => ({
      docId: id,
      source,
      renderedSource: source,
      renderNonce: s.renderNonce + 1,
      title: titleFromSource(source),
      templateId: 'hcmut-btl',
      overrides: {},
      assets: [],
      assetMap: { ...BUILTIN_ASSETS },
      dirty: true,
      savedAt: null,
    }));
    get().setPref('lastDocumentId', id);
    await get().save();
    track('document.create', { sample: withSample });
  },

  async openDocument(id) {
    const doc = await getDocument(id);
    if (!doc) return;
    const assets = await listAssets(id);
    revokeAssets?.();
    const { map, revoke } = toAssetMap(assets);
    const merged = { ...BUILTIN_ASSETS, ...map };
    revokeAssets = revoke;
    set((s) => ({
      docId: doc.id,
      title: doc.title,
      source: doc.source,
      renderedSource: doc.source,
      renderNonce: s.renderNonce + 1,
      templateId: doc.templateId,
      overrides: (doc.overrides ?? {}) as TemplateOverrides,
      assets,
      assetMap: merged,
      dirty: false,
      savedAt: doc.updatedAt,
    }));
    get().setPref('lastDocumentId', doc.id);
    track('document.open', { assets: assets.length, bytes: doc.source.length });
  },

  async removeDocument(id) {
    await deleteDocument(id);
    await get().refreshLibrary();
    if (get().docId === id) {
      const next = get().library[0];
      if (next) await get().openDocument(next.id);
      else await get().createDocument(false);
    }
  },

  async addAssets(files) {
    const { docId } = get();
    const list = Array.from(files);
    const existingNames = new Set(get().assets.map((a) => a.name));
    const added: string[] = [];
    for (const file of list) {
      let name = assetNameFromFile(file.name);
      let n = 2;
      while (existingNames.has(name)) name = `${assetNameFromFile(file.name)}-${n++}`;
      existingNames.add(name);
      added.push(name);
      await putAsset({
        id: newId('asset'),
        docId,
        name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        blob: file,
        createdAt: Date.now(),
      });
      track('asset.add', { bytes: file.size, mime: file.type || 'unknown' });
    }
    const assets = await listAssets(docId);
    revokeAssets?.();
    const { map, revoke } = toAssetMap(assets);
    const merged = { ...BUILTIN_ASSETS, ...map };
    revokeAssets = revoke;
    set({ assets, assetMap: merged });
    return added;
  },

  async removeAsset(id) {
    await deleteAsset(id);
    const assets = await listAssets(get().docId);
    revokeAssets?.();
    const { map, revoke } = toAssetMap(assets);
    const merged = { ...BUILTIN_ASSETS, ...map };
    revokeAssets = revoke;
    set({ assets, assetMap: merged });
  },

  requestGotoLine(line) {
    set({ gotoLine: { line, nonce: Date.now() } });
  },

  noteBlockUsed(id) {
    const recent = [id, ...get().prefs.recentBlocks.filter((r) => r !== id)].slice(0, 5);
    get().setPref('recentBlocks', recent);
  },

  async refreshLibrary() {
    try {
      set({ library: await listDocuments() });
    } catch {
      /* storage unavailable — library stays as-is */
    }
  },

  requestPrint() {
    set((s) => ({ printNonce: s.printNonce + 1 }));
  },

  requestInsertBlock(templateId) {
    set((s) => ({
      insertBlockRequest: { templateId, nonce: (s.insertBlockRequest?.nonce ?? 0) + 1 },
    }));
  },

  renameLabel(oldFull, newFull, definitionLine) {
    const oldId = oldFull.slice(oldFull.indexOf(':') + 1);
    const newId = newFull.slice(newFull.indexOf(':') + 1);
    const lines = get().source.split('\n');
    const at = definitionLine - 1;
    const line = lines[at];
    if (line === undefined) return false;

    // The definition may have been typed with the kind prefix ("#fig:setup")
    // or without it ("#setup" — numbering.ts adds the prefix implicitly for
    // the node's own kind). Try the form actually on the line; if neither is
    // there, stop rather than rename the references to a name the object
    // itself still doesn't carry (P1).
    const attrsRe = (token: string): RegExp => new RegExp(`#${escapeRegExp(token)}(?=[\\s}]|$)`);
    let nextLine: string | null = null;
    if (attrsRe(oldFull).test(line)) {
      nextLine = line.replace(attrsRe(oldFull), `#${newFull}`);
    } else if (attrsRe(oldId).test(line)) {
      nextLine = line.replace(attrsRe(oldId), `#${newId}`);
    }
    if (nextLine === null) return false;
    lines[at] = nextLine;

    // `@kind:id` cross-references are always written in full — the parser
    // only recognises that form (see REF_KINDS in the inline parser) — so a
    // literal, word-boundary-guarded swap is safe everywhere else.
    const refRe = new RegExp(`@${escapeRegExp(oldFull)}(?![\\w:-])`, 'g');
    const next = lines.join('\n').replace(refRe, `@${newFull}`);

    // Renaming is an occasional, explicit action — not a keystroke — so it
    // re-renders right away instead of leaving the panel showing the old
    // name until the next "Dựng trang" (the same choice `setTemplateId` and
    // `setOverrides` already make, for the same reason; P6).
    set((s) => ({
      source: next,
      renderedSource: next,
      renderNonce: s.renderNonce + 1,
      title: titleFromSource(next),
      dirty: true,
    }));
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void get().save();
    }, 900);
    track('label.rename', { kind: oldFull.slice(0, oldFull.indexOf(':')) });
    return true;
  },
}));
