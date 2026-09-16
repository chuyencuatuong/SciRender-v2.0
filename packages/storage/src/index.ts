import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface StoredDocument {
  id: string;
  title: string;
  source: string;
  templateId: string;
  /** Template overrides as a plain JSON object. */
  overrides: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface StoredAsset {
  id: string;
  docId: string;
  /** Logical name used in the source as `asset:<name>`. */
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

interface SciRenderDB extends DBSchema {
  documents: { key: string; value: StoredDocument; indexes: { updatedAt: number } };
  assets: { key: string; value: StoredAsset; indexes: { docId: string } };
  settings: { key: string; value: unknown };
}

const DB_NAME = 'scirender';
const DB_VERSION = 1;
const PREFS_KEY = 'scirender.prefs.v2';

let dbPromise: Promise<IDBPDatabase<SciRenderDB>> | null = null;

/**
 * P5 — Local First. Everything lives in the browser: IndexedDB for documents and
 * binary assets, LocalStorage for small UI preferences. No server, no account,
 * no network call is ever made by this layer.
 */
export function db(): Promise<IDBPDatabase<SciRenderDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SciRenderDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('documents')) {
          const store = database.createObjectStore('documents', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (!database.objectStoreNames.contains('assets')) {
          const store = database.createObjectStore('assets', { keyPath: 'id' });
          store.createIndex('docId', 'docId');
        }
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

export function isStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- documents */

export async function listDocuments(): Promise<StoredDocument[]> {
  const database = await db();
  const all = await database.getAll('documents');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocument(id: string): Promise<StoredDocument | undefined> {
  return (await db()).get('documents', id);
}

export async function putDocument(doc: StoredDocument): Promise<void> {
  await (await db()).put('documents', doc);
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['documents', 'assets'], 'readwrite');
  await tx.objectStore('documents').delete(id);
  const assetStore = tx.objectStore('assets');
  const keys = await assetStore.index('docId').getAllKeys(id);
  for (const key of keys) await assetStore.delete(key);
  await tx.done;
}

/* ----------------------------------------------------------------- assets */

export async function listAssets(docId: string): Promise<StoredAsset[]> {
  const database = await db();
  const all = await database.getAllFromIndex('assets', 'docId', docId);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putAsset(asset: StoredAsset): Promise<void> {
  await (await db()).put('assets', asset);
}

export async function deleteAsset(id: string): Promise<void> {
  await (await db()).delete('assets', id);
}

/** Builds the name -> objectURL map the renderer needs. Caller must revoke. */
export function toAssetMap(assets: StoredAsset[]): {
  map: Record<string, string>;
  revoke: () => void;
} {
  const urls: string[] = [];
  const map: Record<string, string> = {};
  for (const a of assets) {
    const url = URL.createObjectURL(a.blob);
    urls.push(url);
    map[a.name] = url;
  }
  return { map, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}

/** Normalises a file name into a stable `asset:` key. */
export function assetNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'asset';
}

/* ------------------------------------------------------------ preferences */

export interface Preferences {
  lastDocumentId: string | null;
  zoom: number;
  editorWidth: number;
  showDiagnostics: boolean;
  theme: 'light' | 'dark';
  telemetryOptIn: boolean;
  /** Timings, signature and stage breakdown in the status bar. Off by default. */
  showTechStats: boolean;
  /** Block templates used most recently, newest first — drives "Hay dùng". */
  recentBlocks: string[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  lastDocumentId: null,
  zoom: 1,
  editorWidth: 44,
  showDiagnostics: true,
  theme: 'light',
  telemetryOptIn: false,
  showTechStats: false,
  recentBlocks: [],
};

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota or private mode — preferences are not load-bearing */
  }
}

/* --------------------------------------------------------------- id maker */

let counter = 0;

/** Ids only need to be unique, not unguessable. */
export function newId(prefix = 'doc'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/* --------------------------------------------------- import / export bundle */

export interface DocumentBundle {
  format: 'scirender-bundle';
  version: 1;
  document: Omit<StoredDocument, 'id'> & { id?: string };
  assets: Array<{ name: string; mime: string; dataUrl: string }>;
}

export async function exportBundle(docId: string): Promise<DocumentBundle | null> {
  const doc = await getDocument(docId);
  if (!doc) return null;
  const assets = await listAssets(docId);
  const encoded = await Promise.all(
    assets.map(
      async (a) =>
        new Promise<{ name: string; mime: string; dataUrl: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ name: a.name, mime: a.mime, dataUrl: String(reader.result) });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(a.blob);
        }),
    ),
  );
  return { format: 'scirender-bundle', version: 1, document: doc, assets: encoded };
}

export async function importBundle(bundle: DocumentBundle): Promise<string> {
  if (bundle.format !== 'scirender-bundle') {
    throw new Error('Tệp không phải bundle SciRender hợp lệ.');
  }
  const id = newId('doc');
  const now = Date.now();
  await putDocument({
    id,
    title: bundle.document.title || 'Tài liệu nhập',
    source: bundle.document.source ?? '',
    templateId: bundle.document.templateId ?? 'scientific-standard',
    overrides: bundle.document.overrides ?? {},
    createdAt: now,
    updatedAt: now,
  });
  for (const a of bundle.assets ?? []) {
    const res = await fetch(a.dataUrl);
    const blob = await res.blob();
    await putAsset({
      id: newId('asset'),
      docId: id,
      name: a.name,
      mime: a.mime,
      size: blob.size,
      blob,
      createdAt: Date.now(),
    });
  }
  return id;
}
