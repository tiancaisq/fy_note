import { openDB, IDBPDatabase } from 'idb';
import { Folder, Note, CloudConfig, Bookmark, BookmarkCategory } from '../types';
import {
  INITIAL_FOLDERS,
  INITIAL_NOTES,
  INITIAL_BOOKMARKS,
  INITIAL_BOOKMARK_CATEGORIES,
} from '../data/initialData';

const DB_NAME = 'fengye_notes_db';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

const KEY_NOTES = 'notes';
const KEY_FOLDERS = 'folders';
const KEY_FREQUENT_FOLDERS = 'frequent_folders';
const KEY_CLOUD_CONFIG = 'cloud_config';
const KEY_PENDING_DELETIONS = 'pending_deletions';
const KEY_BOOKMARKS = 'bookmarks';
const KEY_BOOKMARK_CATEGORIES = 'bookmark_categories';

// Old LocalStorage Keys for automatic seamless migration
const LEGACY_STORAGE_KEY_NOTES = 'fengye_cloud_notes_data_v2';
const LEGACY_STORAGE_KEY_FOLDERS = 'fengye_cloud_folders_data_v2';
const LEGACY_STORAGE_KEY_FREQUENT_FOLDERS = 'fengye_cloud_frequent_folders_v2';
const LEGACY_STORAGE_KEY_CLOUD_CONFIG = 'fengye_cloud_sync_config_v2';
const STORAGE_KEY_PENDING_DELETIONS = 'fengye_cloud_pending_deletions_v1';
const STORAGE_KEY_BOOKMARKS = 'fengye_cloud_bookmarks_data_v1';
const STORAGE_KEY_BOOKMARK_CATEGORIES = 'fengye_cloud_bookmark_categories_v1';

export interface PendingDeletions {
  noteIds: string[];
  folderIds: string[];
  bookmarkIds: string[];
  bookmarkCategoryIds: string[];
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Automatically migrate data from localStorage to IndexedDB if present
 */
export async function initStorageAndMigrate(): Promise<{
  notes: Note[];
  folders: Folder[];
  frequentFolderIds: string[];
  bookmarks: Bookmark[];
  bookmarkCategories: BookmarkCategory[];
  cloudConfig: CloudConfig;
}> {
  const db = await getDB();

  // Try loading from IndexedDB first
  let storedNotes = await db.get(STORE_NAME, KEY_NOTES);
  let storedFolders = await db.get(STORE_NAME, KEY_FOLDERS);
  let storedFrequentFolders = await db.get(STORE_NAME, KEY_FREQUENT_FOLDERS);
  let storedBookmarks = await db.get(STORE_NAME, KEY_BOOKMARKS);
  let storedBookmarkCategories = await db.get(STORE_NAME, KEY_BOOKMARK_CATEGORIES);
  let storedConfig = await db.get(STORE_NAME, KEY_CLOUD_CONFIG);

  // If IndexedDB is empty, check if there's legacy localStorage data to migrate
  if (!storedNotes) {
    try {
      const legacyNotes = localStorage.getItem(LEGACY_STORAGE_KEY_NOTES);
      if (legacyNotes) {
        storedNotes = JSON.parse(legacyNotes);
        await db.put(STORE_NAME, storedNotes, KEY_NOTES);
      }
    } catch (e) {
      console.warn('Failed to parse legacy notes from localStorage', e);
    }
  }

  if (!storedFolders) {
    try {
      const legacyFolders = localStorage.getItem(LEGACY_STORAGE_KEY_FOLDERS);
      if (legacyFolders) {
        storedFolders = JSON.parse(legacyFolders);
        await db.put(STORE_NAME, storedFolders, KEY_FOLDERS);
      }
    } catch (e) {
      console.warn('Failed to parse legacy folders from localStorage', e);
    }
  }

  if (!storedFrequentFolders) {
    try {
      const legacyFreq = localStorage.getItem(LEGACY_STORAGE_KEY_FREQUENT_FOLDERS);
      if (legacyFreq) {
        storedFrequentFolders = JSON.parse(legacyFreq);
        await db.put(STORE_NAME, storedFrequentFolders, KEY_FREQUENT_FOLDERS);
      }
    } catch (e) {
      console.warn('Failed to parse legacy frequent folders from localStorage', e);
    }
  }

  if (storedBookmarks === undefined) {
    try {
      const localBookmarks = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
      if (localBookmarks) {
        storedBookmarks = JSON.parse(localBookmarks);
        await db.put(STORE_NAME, storedBookmarks, KEY_BOOKMARKS);
      }
    } catch (e) {
      console.warn('Failed to parse bookmarks from localStorage', e);
    }
  }

  if (storedBookmarkCategories === undefined) {
    try {
      const localCategories = localStorage.getItem(STORAGE_KEY_BOOKMARK_CATEGORIES);
      if (localCategories) {
        storedBookmarkCategories = JSON.parse(localCategories);
        await db.put(STORE_NAME, storedBookmarkCategories, KEY_BOOKMARK_CATEGORIES);
      }
    } catch (e) {
      console.warn('Failed to parse bookmark categories from localStorage', e);
    }
  }

  if (!storedConfig) {
    try {
      const legacyConfig = localStorage.getItem(LEGACY_STORAGE_KEY_CLOUD_CONFIG);
      if (legacyConfig) {
        storedConfig = JSON.parse(legacyConfig);
        await db.put(STORE_NAME, storedConfig, KEY_CLOUD_CONFIG);
      }
    } catch (e) {
      console.warn('Failed to parse legacy config from localStorage', e);
    }
  }

  const finalNotes = storedNotes || INITIAL_NOTES;
  const finalFolders = storedFolders || INITIAL_FOLDERS;
  const finalFrequentFolders = storedFrequentFolders || [];
  const finalBookmarks = Array.isArray(storedBookmarks) ? storedBookmarks : INITIAL_BOOKMARKS;
  const finalBookmarkCategories = Array.isArray(storedBookmarkCategories)
    ? storedBookmarkCategories
    : INITIAL_BOOKMARK_CATEGORIES;
  const finalConfig = storedConfig || {
    enabled: true,
    apiUrl: '/api',
    apiToken: '',
    userId: 'default_user',
    autoSync: true,
    lastSyncedAt: null,
  };

  // Ensure IndexedDB has values
  if (!storedNotes) await db.put(STORE_NAME, finalNotes, KEY_NOTES);
  if (!storedFolders) await db.put(STORE_NAME, finalFolders, KEY_FOLDERS);
  if (!storedFrequentFolders) await db.put(STORE_NAME, finalFrequentFolders, KEY_FREQUENT_FOLDERS);
  if (storedBookmarks === undefined) await db.put(STORE_NAME, finalBookmarks, KEY_BOOKMARKS);
  if (storedBookmarkCategories === undefined) {
    await db.put(STORE_NAME, finalBookmarkCategories, KEY_BOOKMARK_CATEGORIES);
  }
  if (!storedConfig) await db.put(STORE_NAME, finalConfig, KEY_CLOUD_CONFIG);

  return {
    notes: finalNotes,
    folders: finalFolders,
    frequentFolderIds: finalFrequentFolders,
    bookmarks: finalBookmarks,
    bookmarkCategories: finalBookmarkCategories,
    cloudConfig: finalConfig,
  };
}

export async function saveNotesToIDB(notes: Note[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.parse(JSON.stringify(notes)), KEY_NOTES);
  } catch (e) {
    console.error('Failed to save notes to IndexedDB', e);
  }
}

export async function saveFoldersToIDB(folders: Folder[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.parse(JSON.stringify(folders)), KEY_FOLDERS);
  } catch (e) {
    console.error('Failed to save folders to IndexedDB', e);
  }
}

export async function saveFrequentFoldersToIDB(frequentFolderIds: string[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.parse(JSON.stringify(frequentFolderIds)), KEY_FREQUENT_FOLDERS);
  } catch (e) {
    console.error('Failed to save frequent folders to IndexedDB', e);
  }
}

export async function saveBookmarksToIDB(bookmarks: Bookmark[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.parse(JSON.stringify(bookmarks)), KEY_BOOKMARKS);
  } catch (e) {
    console.error('Failed to save bookmarks to IndexedDB', e);
  }
}

export async function saveBookmarkCategoriesToIDB(categories: BookmarkCategory[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.parse(JSON.stringify(categories)), KEY_BOOKMARK_CATEGORIES);
  } catch (e) {
    console.error('Failed to save bookmark categories to IndexedDB', e);
  }
}

export async function saveCloudConfigToIDB(config: CloudConfig): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.parse(JSON.stringify(config)), KEY_CLOUD_CONFIG);
  } catch (e) {
    console.error('Failed to save cloud config to IndexedDB', e);
  }
}

export async function loadPendingDeletionsFromIDB(): Promise<PendingDeletions> {
  try {
    const db = await getDB();
    const stored = await db.get(STORE_NAME, KEY_PENDING_DELETIONS);
    if (
      stored &&
      (Array.isArray(stored.noteIds) ||
        Array.isArray(stored.folderIds) ||
        Array.isArray(stored.bookmarkIds) ||
        Array.isArray(stored.bookmarkCategoryIds))
    ) {
      return {
        noteIds: Array.isArray(stored.noteIds) ? stored.noteIds.map(String) : [],
        folderIds: Array.isArray(stored.folderIds) ? stored.folderIds.map(String) : [],
        bookmarkIds: Array.isArray(stored.bookmarkIds) ? stored.bookmarkIds.map(String) : [],
        bookmarkCategoryIds: Array.isArray(stored.bookmarkCategoryIds)
          ? stored.bookmarkCategoryIds.map(String)
          : [],
      };
    }
  } catch (e) {
    console.warn('Failed to load pending deletions from IndexedDB', e);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_DELETIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        noteIds: Array.isArray(parsed?.noteIds) ? parsed.noteIds.map(String) : [],
        folderIds: Array.isArray(parsed?.folderIds) ? parsed.folderIds.map(String) : [],
        bookmarkIds: Array.isArray(parsed?.bookmarkIds) ? parsed.bookmarkIds.map(String) : [],
        bookmarkCategoryIds: Array.isArray(parsed?.bookmarkCategoryIds)
          ? parsed.bookmarkCategoryIds.map(String)
          : [],
      };
    }
  } catch {}

  return { noteIds: [], folderIds: [], bookmarkIds: [], bookmarkCategoryIds: [] };
}

export async function savePendingDeletionsToIDB(pending: PendingDeletions): Promise<void> {
  const payload: PendingDeletions = {
    noteIds: Array.from(new Set(pending.noteIds.map(String))),
    folderIds: Array.from(new Set(pending.folderIds.map(String))),
    bookmarkIds: Array.from(new Set((pending.bookmarkIds || []).map(String))),
    bookmarkCategoryIds: Array.from(new Set((pending.bookmarkCategoryIds || []).map(String))),
  };
  try {
    localStorage.setItem(STORAGE_KEY_PENDING_DELETIONS, JSON.stringify(payload));
  } catch {}
  try {
    const db = await getDB();
    await db.put(STORE_NAME, payload, KEY_PENDING_DELETIONS);
  } catch (e) {
    console.error('Failed to save pending deletions to IndexedDB', e);
  }
}

/**
 * Get current IndexedDB storage estimation stats (Usage & Quota)
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  usageFormatted: string;
  quotaFormatted: string;
  percent: number;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
      };

      const percent = quota > 0 ? (usage / quota) * 100 : 0;
      return {
        usage,
        quota,
        usageFormatted: formatBytes(usage),
        quotaFormatted: formatBytes(quota),
        percent: Number(percent.toFixed(2)),
      };
    } catch (e) {
      console.warn('Storage estimate failed', e);
    }
  }

  return {
    usage: 0,
    quota: 0,
    usageFormatted: '未知',
    quotaFormatted: '未知',
    percent: 0,
  };
}
