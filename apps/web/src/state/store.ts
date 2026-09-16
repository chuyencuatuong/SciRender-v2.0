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

export type PanelId = 'outline' | 'diagnostics' | 'health' | 'assets' | 'template' | 'library' | 'research';

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

  async init() {
    const prefs = loadPreferences();
    initTelemetry(prefs.telemetryOptIn);
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
}));
