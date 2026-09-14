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
import type { TemplateOverrides } from '@scirender/template-engine';
import { SAMPLE_DOCUMENT, EMPTY_DOCUMENT } from '~/lib/sample';

export type PanelId = 'outline' | 'diagnostics' | 'health' | 'assets' | 'template' | 'library' | 'research';

export interface AppState {
  ready: boolean;
  docId: string;
  title: string;
  source: string;
  templateId: string;
  overrides: TemplateOverrides;
  assets: StoredAsset[];
  assetMap: Record<string, string>;
  library: StoredDocument[];
  prefs: Preferences;
  panel: PanelId;
  dirty: boolean;
  savedAt: number | null;
  storageError: string | null;
  /** Line the editor should scroll to; bumped by diagnostics/outline clicks. */
  gotoLine: { line: number; nonce: number } | null;

  init: () => Promise<void>;
  setSource: (source: string) => void;
  setPanel: (panel: PanelId) => void;
  setTemplateId: (id: string) => void;
  setOverrides: (patch: TemplateOverrides) => void;
  resetOverrides: () => void;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  save: () => Promise<void>;
  createDocument: (withSample?: boolean) => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  addAssets: (files: FileList | File[]) => Promise<void>;
  removeAsset: (id: string) => Promise<void>;
  requestGotoLine: (line: number) => void;
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
  templateId: 'scientific-standard',
  overrides: {},
  assets: [],
  assetMap: {},
  library: [],
  prefs: { ...DEFAULT_PREFERENCES },
  panel: 'diagnostics',
  dirty: false,
  savedAt: null,
  storageError: null,
  gotoLine: null,

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

  setPanel(panel) {
    set({ panel });
    track('panel.open', { panel });
  },

  setTemplateId(templateId) {
    set({ templateId, dirty: true });
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
    set({ overrides: merged, dirty: true });
    void get().save();
  },

  resetOverrides() {
    set({ overrides: {}, dirty: true });
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
    set({
      docId: id,
      source,
      title: titleFromSource(source),
      templateId: 'scientific-standard',
      overrides: {},
      assets: [],
      assetMap: {},
      dirty: true,
      savedAt: null,
    });
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
    revokeAssets = revoke;
    set({
      docId: doc.id,
      title: doc.title,
      source: doc.source,
      templateId: doc.templateId,
      overrides: (doc.overrides ?? {}) as TemplateOverrides,
      assets,
      assetMap: map,
      dirty: false,
      savedAt: doc.updatedAt,
    });
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
    for (const file of list) {
      let name = assetNameFromFile(file.name);
      let n = 2;
      while (existingNames.has(name)) name = `${assetNameFromFile(file.name)}-${n++}`;
      existingNames.add(name);
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
    revokeAssets = revoke;
    set({ assets, assetMap: map });
  },

  async removeAsset(id) {
    await deleteAsset(id);
    const assets = await listAssets(get().docId);
    revokeAssets?.();
    const { map, revoke } = toAssetMap(assets);
    revokeAssets = revoke;
    set({ assets, assetMap: map });
  },

  requestGotoLine(line) {
    set({ gotoLine: { line, nonce: Date.now() } });
  },

  async refreshLibrary() {
    try {
      set({ library: await listDocuments() });
    } catch {
      /* storage unavailable — library stays as-is */
    }
  },
}));
