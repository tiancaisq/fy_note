import { openDB, IDBPDatabase } from 'idb';
import { Folder, Note, CloudConfig } from '../types';
import { INITIAL_FOLDERS, INITIAL_NOTES } from '../data/initialData';

const DB_NAME = 'fengye_notes_db';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

const KEY_NOTES = 'notes';
const KEY_FOLDERS = 'folders';
const KEY_CLOUD_CONFIG = 'cloud_config';

// Old LocalStorage Keys for automatic seamless migration
const LEGACY_STORAGE_KEY_NOTES = 'fengye_cloud_notes_data_v2';
const LEGACY_STORAGE_KEY_FOLDERS = 'fengye_cloud_folders_data_v2';
const LEGACY_STORAGE_KEY_CLOUD_CONFIG = 'fengye_cloud_sync_config_v2';

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
  cloudConfig: CloudConfig;
}> {
  const db = await getDB();

  // Try loading from IndexedDB first
  let storedNotes = await db.get(STORE_NAME, KEY_NOTES);
  let storedFolders = await db.get(STORE_NAME, KEY_FOLDERS);
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
  if (!storedConfig) await db.put(STORE_NAME, finalConfig, KEY_CLOUD_CONFIG);

  return {
    notes: finalNotes,
    folders: finalFolders,
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

export async function saveCloudConfigToIDB(config: CloudConfig): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, JSON.parse(JSON.stringify(config)), KEY_CLOUD_CONFIG);
  } catch (e) {
    console.error('Failed to save cloud config to IndexedDB', e);
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
