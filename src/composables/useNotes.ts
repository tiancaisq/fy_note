import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import {
  Folder,
  Note,
  Bookmark,
  BookmarkCategory,
  ViewType,
  SortField,
  SortOrder,
  FilterOptions,
  BreadcrumbItem,
  SearchResultItem,
  BookmarkSearchResultItem,
  CloudConfig,
  SyncStatus,
  SyncDiffResult,
} from '../types';
import {
  INITIAL_FOLDERS,
  INITIAL_NOTES,
  INITIAL_BOOKMARKS,
  INITIAL_BOOKMARK_CATEGORIES,
} from '../data/initialData';
import { exportToXMind } from '../utils/xmind';
import { parseFreeMindXml } from '../utils/freemind';
import { createDefaultDrawioXml, extractDrawioTextNodes } from '../utils/drawioTemplates';
import { compareFolders, normalizeFolderOrders, reorderFolder } from '../utils/folderSort';
import {
  normalizeBookmarkUrl,
  extractBookmarkHost,
  deriveTitleFromUrl,
  getDefaultFaviconUrl,
  fetchTargetSiteMetadata,
} from '../utils/bookmarkHelpers';
import {
  initStorageAndMigrate,
  saveNotesToIDB,
  saveFoldersToIDB,
  saveFrequentFoldersToIDB,
  saveBookmarksToIDB,
  saveBookmarkCategoriesToIDB,
  saveCloudConfigToIDB,
  loadPendingDeletionsFromIDB,
  savePendingDeletionsToIDB,
  getStorageEstimate,
} from '../utils/idbStorage';
import {
  testCloudApi,
  fetchRemoteData,
  calculateSyncDiff,
  pushSyncToCloud,
  saveSingleNoteToCloud,
  deleteSingleNoteFromCloud,
  emptyTrashOnCloud,
  saveFoldersToCloud,
  deleteSingleFolderFromCloud,
  saveFrequentFoldersToCloud,
  deleteFrequentFolderFromCloud,
  saveBookmarksToCloud,
  deleteSingleBookmarkFromCloud,
  saveBookmarkCategoriesToCloud,
  deleteSingleBookmarkCategoryFromCloud,
  clearApiEndpointCache,
} from '../utils/cloudApi';

const STORAGE_KEY_NOTES = 'fengye_cloud_notes_data_v2';
const STORAGE_KEY_FOLDERS = 'fengye_cloud_folders_data_v2';
const STORAGE_KEY_CLOUD_CONFIG = 'fengye_cloud_sync_config_v2';
const STORAGE_KEY_FREQUENT_FOLDERS = 'fengye_cloud_frequent_folders_v2';
const STORAGE_KEY_BOOKMARKS = 'fengye_cloud_bookmarks_data_v1';
const STORAGE_KEY_BOOKMARK_CATEGORIES = 'fengye_cloud_bookmark_categories_v1';
const STORAGE_KEY_OPEN_TABS = 'fengye_open_tabs_v1';
const STORAGE_KEY_ACTIVE_TAB = 'fengye_active_tab_v1';

function normalizeBookmarkCategoryOrders(list: BookmarkCategory[]): BookmarkCategory[] {
  const validIds = new Set(list.map((c) => c.id));
  const grouped = new Map<string, BookmarkCategory[]>();

  list.forEach((raw) => {
    const parentId = raw.parentId && validIds.has(raw.parentId) && raw.parentId !== raw.id ? raw.parentId : null;
    const key = parentId || '__root__';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      ...raw,
      parentId,
      isOpen: raw.isOpen !== undefined ? Boolean(raw.isOpen) : true,
    });
  });

  const result: BookmarkCategory[] = [];
  grouped.forEach((siblings) => {
    siblings
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || '').localeCompare(b.createdAt || ''))
      .forEach((cat, idx) => {
        result.push({ ...cat, order: idx + 1 });
      });
  });
  return result;
}

function loadStoredData<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load storage', e);
  }
  return fallback;
}

export function useNotes() {
  const isStorageReady = ref<boolean>(false);
  const folders = ref<Folder[]>(normalizeFolderOrders(loadStoredData(STORAGE_KEY_FOLDERS, INITIAL_FOLDERS)));
  const notes = ref<Note[]>(loadStoredData(STORAGE_KEY_NOTES, INITIAL_NOTES));
  const bookmarks = ref<Bookmark[]>(loadStoredData(STORAGE_KEY_BOOKMARKS, INITIAL_BOOKMARKS));
  const bookmarkCategories = ref<BookmarkCategory[]>(
    normalizeBookmarkCategoryOrders(
      loadStoredData(STORAGE_KEY_BOOKMARK_CATEGORIES, INITIAL_BOOKMARK_CATEGORIES)
    )
  );

  // Frequent / Pinned Folders
  const frequentFolderIds = ref<string[]>(
    loadStoredData(STORAGE_KEY_FREQUENT_FOLDERS, [])
  );

  watch(
    frequentFolderIds,
    (newIds) => {
      try {
        localStorage.setItem(STORAGE_KEY_FREQUENT_FOLDERS, JSON.stringify(newIds));
        saveFrequentFoldersToIDB(newIds).catch(console.error);
      } catch (err) {
        console.warn('Failed to save frequent folders', err);
      }
    },
    { deep: true }
  );

  // Cloud Synchronization Configuration
  const defaultCloudConfig: CloudConfig = {
    enabled: true,
    apiUrl: '/api',
    apiToken: '',
    userId: 'default_user',
    autoSync: true,
    lastSyncedAt: null,
  };
  const cloudConfig = ref<CloudConfig>(loadStoredData(STORAGE_KEY_CLOUD_CONFIG, defaultCloudConfig));
  const isCloudSyncModalOpen = ref<boolean>(false);
  const syncStatus = ref<SyncStatus>(
    cloudConfig.value.enabled && cloudConfig.value.apiUrl
      ? cloudConfig.value.lastSyncedAt
        ? 'synced'
        : 'unsynced'
      : 'unconfigured'
  );
  const syncDiff = ref<SyncDiffResult | null>(null);
  const isSyncing = ref<boolean>(false);
  const isApplyingRemoteSync = ref<boolean>(false);
  let autoSyncDebounceTimer: any = null;
  let hasQueuedChangesDuringSync = false;
  let lastVisibilitySyncAt = 0;

  function isCloudConfigured(): boolean {
    return Boolean(cloudConfig.value.enabled && cloudConfig.value.apiUrl && cloudConfig.value.apiUrl.trim());
  }

  function isAutoSyncActive(): boolean {
    return isCloudConfigured() && Boolean(cloudConfig.value.autoSync);
  }

  // Storage estimation metrics
  const storageInfo = ref<{
    usage: number;
    quota: number;
    usageFormatted: string;
    quotaFormatted: string;
    percent: number;
  }>({
    usage: 0,
    quota: 0,
    usageFormatted: '0 B',
    quotaFormatted: '0 B',
    percent: 0,
  });

  async function updateStorageEstimate() {
    try {
      const estimate = await getStorageEstimate();
      storageInfo.value = estimate;
    } catch (e) {
      console.warn('Storage estimate failed', e);
    }
  }

  let handleStorageChangeRef: ((e: StorageEvent) => void) | null = null;
  let handleVisibilityChangeRef: (() => void) | null = null;

  // Asynchronous IndexedDB initialization & migration on startup
  onMounted(async () => {
    try {
      isApplyingRemoteSync.value = true;
      const [
        {
          notes: idbNotes,
          folders: idbFolders,
          frequentFolderIds: idbFrequentFolders,
          bookmarks: idbBookmarks,
          bookmarkCategories: idbBookmarkCategories,
          cloudConfig: idbConfig,
        },
        storedDeletions,
      ] = await Promise.all([initStorageAndMigrate(), loadPendingDeletionsFromIDB()]);

      if (Array.isArray(idbNotes)) notes.value = idbNotes;
      if (Array.isArray(idbFolders)) {
        folders.value = normalizeFolderOrders(idbFolders);
      }
      if (Array.isArray(idbFrequentFolders) && idbFrequentFolders.length > 0) {
        frequentFolderIds.value = idbFrequentFolders;
      }
      if (Array.isArray(idbBookmarks)) {
        bookmarks.value = idbBookmarks;
      }
      if (Array.isArray(idbBookmarkCategories)) {
        bookmarkCategories.value = normalizeBookmarkCategoryOrders(idbBookmarkCategories);
      }
      if (idbConfig) cloudConfig.value = idbConfig;

      // Restore pending deletions from durable storage before initial merge
      storedDeletions.noteIds.forEach((id) => pendingDeletedNoteIds.add(id));
      storedDeletions.folderIds.forEach((id) => pendingDeletedFolderIds.add(id));
      storedDeletions.bookmarkIds.forEach((id) => pendingDeletedBookmarkIds.add(id));
      storedDeletions.bookmarkCategoryIds.forEach((id) => pendingDeletedBookmarkCategoryIds.add(id));

      isStorageReady.value = true;
      await updateStorageEstimate();
      await nextTick();
      isApplyingRemoteSync.value = false;

      // Check URL parameters for noteId to directly open in a workspace tab
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetNoteId =
          urlParams.get('noteId') ||
          urlParams.get('note') ||
          (window.location.hash.startsWith('#note-') ? window.location.hash.substring(1) : null);
        if (targetNoteId) {
          const matched = notes.value.find((n) => n.id === targetNoteId);
          if (matched && !matched.isDeleted) {
            activeFolderId.value = matched.folderId;
            openNoteTab(matched, 'split');
          }
        }
      } catch (err) {
        console.warn('Failed to parse noteId from URL:', err);
      }

      // Automatically sync latest notes and folders from cloud on initial startup if enabled
      if (isCloudConfigured()) {
        lastVisibilitySyncAt = Date.now();
        performCloudSync('merge', undefined, true).catch((e) => {
          console.warn('Initial cloud sync notice:', e);
        });
      }
    } catch (e) {
      console.error('IndexedDB initialization error:', e);
      isStorageReady.value = true;
      isApplyingRemoteSync.value = false;
    }

    // Cross-tab synchronization via storage event
    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_NOTES && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            isApplyingRemoteSync.value = true;
            notes.value = parsed;
            await nextTick();
            isApplyingRemoteSync.value = false;
          }
        } catch {}
      } else if (e.key === STORAGE_KEY_FOLDERS && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            isApplyingRemoteSync.value = true;
            folders.value = normalizeFolderOrders(parsed);
            await nextTick();
            isApplyingRemoteSync.value = false;
          }
        } catch {}
      } else if (e.key === STORAGE_KEY_BOOKMARKS && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            isApplyingRemoteSync.value = true;
            bookmarks.value = parsed;
            await nextTick();
            isApplyingRemoteSync.value = false;
          }
        } catch {}
      } else if (e.key === STORAGE_KEY_BOOKMARK_CATEGORIES && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            isApplyingRemoteSync.value = true;
            bookmarkCategories.value = normalizeBookmarkCategoryOrders(parsed);
            await nextTick();
            isApplyingRemoteSync.value = false;
          }
        } catch {}
      }
    };
    handleStorageChangeRef = handleStorageChange;
    window.addEventListener('storage', handleStorageChange);

    // Multi-device freshness: silently merge remote changes when returning to tab (throttled to 30s)
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        isAutoSyncActive() &&
        !isSyncing.value &&
        !isApplyingRemoteSync.value &&
        Date.now() - lastVisibilitySyncAt > 30000
      ) {
        lastVisibilitySyncAt = Date.now();
        performCloudSync('merge', undefined, true).catch(() => {});
      }
    };
    handleVisibilityChangeRef = handleVisibilityChange;
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onUnmounted(() => {
    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = null;
    }
    if (handleStorageChangeRef) {
      window.removeEventListener('storage', handleStorageChangeRef);
    }
    if (handleVisibilityChangeRef) {
      document.removeEventListener('visibilitychange', handleVisibilityChangeRef);
    }
  });

  // Current active view and selection
  const currentView = ref<ViewType>('folder');
  const activeFolderId = ref<string>(folders.value[0]?.id || '');
  const searchQuery = ref<string>('');

  // Active note and editor mode for workspace tabs
  const activeNoteId = ref<string | null>(null);
  const editorMode = ref<'split' | 'edit' | 'preview'>('split');

  // In-app Workspace Tab Window Management
  const openTabIds = ref<string[]>(loadStoredData<string[]>(STORAGE_KEY_OPEN_TABS, []));
  const activeTabId = ref<string>(loadStoredData<string>(STORAGE_KEY_ACTIVE_TAB, 'workspace'));

  const openTabNotes = computed<Note[]>(() => {
    const validNotes: Note[] = [];
    for (const id of openTabIds.value) {
      const found = notes.value.find((n) => n.id === id && !n.isDeleted);
      if (found) {
        validNotes.push(found);
      }
    }
    return validNotes;
  });

  const activeTabNote = computed<Note | null>(() => {
    if (!activeTabId.value || activeTabId.value === 'workspace') return null;
    return openTabNotes.value.find((n) => n.id === activeTabId.value) || null;
  });

  watch(
    openTabIds,
    (ids) => {
      try {
        localStorage.setItem(STORAGE_KEY_OPEN_TABS, JSON.stringify(ids));
      } catch {}
    },
    { deep: true }
  );

  watch(activeTabId, (id) => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, JSON.stringify(id));
    } catch {}
  });

  // Ensure openTabIds and activeTabId remain valid when notes change (e.g. after cloud sync or deletion)
  watch(
    notes,
    (newNotes) => {
      const validSet = new Set(newNotes.filter((n) => !n.isDeleted).map((n) => n.id));
      const filtered = openTabIds.value.filter((id) => validSet.has(id));
      if (filtered.length !== openTabIds.value.length) {
        openTabIds.value = filtered;
      }
      if (activeTabId.value !== 'workspace' && !validSet.has(activeTabId.value)) {
        activeTabId.value = filtered[filtered.length - 1] || 'workspace';
      }
    },
    { deep: true }
  );

  // Sort & Filter
  const sortField = ref<SortField>('createdAt');
  const sortOrder = ref<SortOrder>('desc');
  const filterOptions = ref<FilterOptions>({
    starredOnly: false,
    format: 'all',
  });

  // Selected note IDs for batch operations
  const selectedNoteIds = ref<string[]>([]);

  // Modals state
  const isImportModalOpen = ref<boolean>(false);
  const isNewFolderModalOpen = ref<boolean>(false);
  const targetParentFolderForNew = ref<Folder | null>(null);
  const isMoveModalOpen = ref<boolean>(false);
  const noteToMove = ref<Note | null>(null);
  const notesToMove = ref<Note[]>([]);
  const isRenameNoteModalOpen = ref<boolean>(false);
  const noteToRename = ref<Note | null>(null);

  // Toast feedback
  const toastMessage = ref<string | null>(null);
  let toastTimer: any = null;

  function showToast(msg: string) {
    toastMessage.value = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage.value = null;
    }, 2800);
  }

  // Persist to IndexedDB (and keep localStorage updated as immediate synchronous fallback)
  watch(
    notes,
    (newNotes) => {
      saveNotesToIDB(newNotes);
      try {
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(newNotes));
      } catch (e) {
        // localStorage quota might be exceeded for large notes, which is why IndexedDB is primary
        console.warn('LocalStorage backup skipped or full, IndexedDB is handling storage:', e);
      }
      if (!isApplyingRemoteSync.value) {
        triggerAutoSyncDebounced();
      }
      updateStorageEstimate();
    },
    { deep: true }
  );

  watch(
    folders,
    (newFolders) => {
      saveFoldersToIDB(newFolders);
      try {
        localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(newFolders));
      } catch (e) {
        console.warn('LocalStorage backup skipped:', e);
      }
      if (!isApplyingRemoteSync.value) {
        triggerAutoSyncDebounced();
      }
      updateStorageEstimate();
    },
    { deep: true }
  );

  watch(
    bookmarks,
    (newBookmarks) => {
      saveBookmarksToIDB(newBookmarks);
      try {
        localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify(newBookmarks));
      } catch (e) {
        console.warn('LocalStorage backup skipped:', e);
      }
      if (!isApplyingRemoteSync.value) {
        triggerAutoSyncDebounced();
      }
      updateStorageEstimate();
    },
    { deep: true }
  );

  watch(
    bookmarkCategories,
    (newCategories) => {
      saveBookmarkCategoriesToIDB(newCategories);
      try {
        localStorage.setItem(STORAGE_KEY_BOOKMARK_CATEGORIES, JSON.stringify(newCategories));
      } catch (e) {
        console.warn('LocalStorage backup skipped:', e);
      }
      if (!isApplyingRemoteSync.value) {
        triggerAutoSyncDebounced();
      }
      updateStorageEstimate();
    },
    { deep: true }
  );

  watch(
    cloudConfig,
    (newConfig) => {
      saveCloudConfigToIDB(newConfig);
      try {
        localStorage.setItem(STORAGE_KEY_CLOUD_CONFIG, JSON.stringify(newConfig));
      } catch (e) {
        console.warn('LocalStorage backup skipped:', e);
      }
    },
    { deep: true }
  );

  // Queue of modified/deleted entity IDs & mutation sequence tracking for race-free incremental sync
  const pendingModifiedNoteIds = new Set<string>();
  const pendingModifiedFolderIds = new Set<string>();
  const pendingModifiedBookmarkIds = new Set<string>();
  const pendingModifiedBookmarkCategoryIds = new Set<string>();
  const pendingDeletedNoteIds = new Set<string>();
  const pendingDeletedFolderIds = new Set<string>();
  const pendingDeletedBookmarkIds = new Set<string>();
  const pendingDeletedBookmarkCategoryIds = new Set<string>();
  const noteDirtySeq = new Map<string, number>();
  const folderDirtySeq = new Map<string, number>();
  const bookmarkDirtySeq = new Map<string, number>();
  const bookmarkCategoryDirtySeq = new Map<string, number>();
  const noteDeletedSeq = new Map<string, number>();
  const folderDeletedSeq = new Map<string, number>();
  const bookmarkDeletedSeq = new Map<string, number>();
  const bookmarkCategoryDeletedSeq = new Map<string, number>();
  let globalDirtySeq = 0;

  function persistPendingDeletions() {
    savePendingDeletionsToIDB({
      noteIds: Array.from(pendingDeletedNoteIds),
      folderIds: Array.from(pendingDeletedFolderIds),
      bookmarkIds: Array.from(pendingDeletedBookmarkIds),
      bookmarkCategoryIds: Array.from(pendingDeletedBookmarkCategoryIds),
    }).catch(console.error);
  }

  function hasAnyPendingSyncItems(): boolean {
    return (
      pendingModifiedNoteIds.size > 0 ||
      pendingModifiedFolderIds.size > 0 ||
      pendingModifiedBookmarkIds.size > 0 ||
      pendingModifiedBookmarkCategoryIds.size > 0 ||
      pendingDeletedNoteIds.size > 0 ||
      pendingDeletedFolderIds.size > 0 ||
      pendingDeletedBookmarkIds.size > 0 ||
      pendingDeletedBookmarkCategoryIds.size > 0
    );
  }

  async function executeAutoSyncBatch() {
    if (!isAutoSyncActive()) return;
    if (!hasAnyPendingSyncItems()) {
      if (cloudConfig.value.lastSyncedAt) {
        syncStatus.value = 'synced';
      }
      return;
    }
    if (isSyncing.value || isApplyingRemoteSync.value) {
      hasQueuedChangesDuringSync = true;
      return;
    }

    try {
      isSyncing.value = true;
      syncStatus.value = 'syncing';

      // Snapshot current dirty IDs & sequence numbers BEFORE async requests
      const syncStartSeq = globalDirtySeq;
      const batchNoteIds = Array.from(pendingModifiedNoteIds);
      const batchFolderIds = Array.from(pendingModifiedFolderIds);
      const batchBookmarkIds = Array.from(pendingModifiedBookmarkIds);
      const batchBookmarkCategoryIds = Array.from(pendingModifiedBookmarkCategoryIds);
      const batchDelNoteIds = Array.from(pendingDeletedNoteIds);
      const batchDelFolderIds = Array.from(pendingDeletedFolderIds);
      const batchDelBookmarkIds = Array.from(pendingDeletedBookmarkIds);
      const batchDelBookmarkCategoryIds = Array.from(pendingDeletedBookmarkCategoryIds);

      const noteSeqSnapshot = new Map<string, number>();
      batchNoteIds.forEach((id) => noteSeqSnapshot.set(id, noteDirtySeq.get(id) || 0));
      const folderSeqSnapshot = new Map<string, number>();
      batchFolderIds.forEach((id) => folderSeqSnapshot.set(id, folderDirtySeq.get(id) || 0));
      const bookmarkSeqSnapshot = new Map<string, number>();
      batchBookmarkIds.forEach((id) => bookmarkSeqSnapshot.set(id, bookmarkDirtySeq.get(id) || 0));
      const bookmarkCategorySeqSnapshot = new Map<string, number>();
      batchBookmarkCategoryIds.forEach((id) =>
        bookmarkCategorySeqSnapshot.set(id, bookmarkCategoryDirtySeq.get(id) || 0)
      );

      const totalPending =
        batchNoteIds.length +
        batchFolderIds.length +
        batchBookmarkIds.length +
        batchBookmarkCategoryIds.length +
        batchDelNoteIds.length +
        batchDelFolderIds.length +
        batchDelBookmarkIds.length +
        batchDelBookmarkCategoryIds.length;

      // 1. Lightweight incremental sync when pending item count is small
      if (totalPending > 0 && totalPending <= 15) {
        let allOk = true;
        let deletionsChanged = false;

        // Sync modified notes individually
        for (const nid of batchNoteIds) {
          const note = notes.value.find((n) => n.id === nid);
          if (!note) {
            if ((noteDirtySeq.get(nid) || 0) <= (noteSeqSnapshot.get(nid) || 0)) {
              pendingModifiedNoteIds.delete(nid);
            }
            continue;
          }
          const res = await saveSingleNoteToCloud(cloudConfig.value, note);
          if (res.success) {
            if ((noteDirtySeq.get(nid) || 0) <= (noteSeqSnapshot.get(nid) || 0)) {
              pendingModifiedNoteIds.delete(nid);
            }
          } else {
            allOk = false;
          }
        }

        // Sync deleted notes
        for (const nid of batchDelNoteIds) {
          const res = await deleteSingleNoteFromCloud(cloudConfig.value, nid);
          if (res.success) {
            pendingDeletedNoteIds.delete(nid);
            deletionsChanged = true;
          } else {
            allOk = false;
          }
        }

        // Sync modified folders in batch (preserving all updated orders and parentIds)
        if (batchFolderIds.length > 0) {
          const modifiedFolders = folders.value.filter((f) => batchFolderIds.includes(f.id));
          if (modifiedFolders.length > 0) {
            const res = await saveFoldersToCloud(cloudConfig.value, modifiedFolders);
            if (res.success) {
              batchFolderIds.forEach((fid) => {
                if ((folderDirtySeq.get(fid) || 0) <= (folderSeqSnapshot.get(fid) || 0)) {
                  pendingModifiedFolderIds.delete(fid);
                }
              });
            } else {
              allOk = false;
            }
          } else {
            batchFolderIds.forEach((fid) => {
              if ((folderDirtySeq.get(fid) || 0) <= (folderSeqSnapshot.get(fid) || 0)) {
                pendingModifiedFolderIds.delete(fid);
              }
            });
          }
        }

        // Sync deleted folders
        for (const fid of batchDelFolderIds) {
          const res = await deleteSingleFolderFromCloud(cloudConfig.value, fid);
          if (res.success) {
            pendingDeletedFolderIds.delete(fid);
            deletionsChanged = true;
          } else {
            allOk = false;
          }
        }

        // Sync modified bookmark categories in batch
        if (batchBookmarkCategoryIds.length > 0) {
          const modifiedCategories = bookmarkCategories.value.filter((c) =>
            batchBookmarkCategoryIds.includes(c.id)
          );
          if (modifiedCategories.length > 0) {
            const res = await saveBookmarkCategoriesToCloud(cloudConfig.value, modifiedCategories);
            if (res.success) {
              batchBookmarkCategoryIds.forEach((cid) => {
                if ((bookmarkCategoryDirtySeq.get(cid) || 0) <= (bookmarkCategorySeqSnapshot.get(cid) || 0)) {
                  pendingModifiedBookmarkCategoryIds.delete(cid);
                }
              });
            } else {
              allOk = false;
            }
          } else {
            batchBookmarkCategoryIds.forEach((cid) => {
              if ((bookmarkCategoryDirtySeq.get(cid) || 0) <= (bookmarkCategorySeqSnapshot.get(cid) || 0)) {
                pendingModifiedBookmarkCategoryIds.delete(cid);
              }
            });
          }
        }

        // Sync deleted bookmark categories
        for (const cid of batchDelBookmarkCategoryIds) {
          const res = await deleteSingleBookmarkCategoryFromCloud(cloudConfig.value, cid);
          if (res.success) {
            pendingDeletedBookmarkCategoryIds.delete(cid);
            deletionsChanged = true;
          } else {
            allOk = false;
          }
        }

        // Sync modified bookmarks in batch
        if (batchBookmarkIds.length > 0) {
          const modifiedBookmarks = bookmarks.value.filter((b) => batchBookmarkIds.includes(b.id));
          if (modifiedBookmarks.length > 0) {
            const res = await saveBookmarksToCloud(cloudConfig.value, modifiedBookmarks);
            if (res.success) {
              batchBookmarkIds.forEach((bid) => {
                if ((bookmarkDirtySeq.get(bid) || 0) <= (bookmarkSeqSnapshot.get(bid) || 0)) {
                  pendingModifiedBookmarkIds.delete(bid);
                }
              });
            } else {
              allOk = false;
            }
          } else {
            batchBookmarkIds.forEach((bid) => {
              if ((bookmarkDirtySeq.get(bid) || 0) <= (bookmarkSeqSnapshot.get(bid) || 0)) {
                pendingModifiedBookmarkIds.delete(bid);
              }
            });
          }
        }

        // Sync directly deleted bookmarks (tombstones)
        for (const bid of batchDelBookmarkIds) {
          const res = await deleteSingleBookmarkFromCloud(cloudConfig.value, bid);
          if (res.success) {
            pendingDeletedBookmarkIds.delete(bid);
            deletionsChanged = true;
          } else {
            allOk = false;
          }
        }

        if (deletionsChanged) {
          persistPendingDeletions();
        }

        if (allOk) {
          cloudConfig.value.lastSyncedAt = Date.now();
          lastVisibilitySyncAt = Date.now();
          if (hasAnyPendingSyncItems()) {
            hasQueuedChangesDuringSync = true;
            syncStatus.value = 'unsynced';
          } else {
            syncStatus.value = 'synced';
          }
          return;
        }
      }

      // 2. Full two-way smart merge (for large batches, generic watch triggers, or incremental fallback)
      const res = await pushSyncToCloud(cloudConfig.value, notes.value, folders.value, 'merge', {
        deletedNoteIds: batchDelNoteIds,
        deletedFolderIds: batchDelFolderIds,
        frequentFolderIds: frequentFolderIds.value,
        bookmarks: bookmarks.value,
        bookmarkCategories: bookmarkCategories.value,
        deletedBookmarkIds: batchDelBookmarkIds,
        deletedBookmarkCategoryIds: batchDelBookmarkCategoryIds,
      });

      if (res.success) {
        isApplyingRemoteSync.value = true;

        // Clear only the items whose mutation happened at or before syncStartSeq
        batchNoteIds.forEach((nid) => {
          if ((noteDirtySeq.get(nid) || 0) <= (noteSeqSnapshot.get(nid) || 0)) {
            pendingModifiedNoteIds.delete(nid);
          }
        });
        batchFolderIds.forEach((fid) => {
          if ((folderDirtySeq.get(fid) || 0) <= (folderSeqSnapshot.get(fid) || 0)) {
            pendingModifiedFolderIds.delete(fid);
          }
        });
        batchBookmarkIds.forEach((bid) => {
          if ((bookmarkDirtySeq.get(bid) || 0) <= (bookmarkSeqSnapshot.get(bid) || 0)) {
            pendingModifiedBookmarkIds.delete(bid);
          }
        });
        batchBookmarkCategoryIds.forEach((cid) => {
          if ((bookmarkCategoryDirtySeq.get(cid) || 0) <= (bookmarkCategorySeqSnapshot.get(cid) || 0)) {
            pendingModifiedBookmarkCategoryIds.delete(cid);
          }
        });
        batchDelNoteIds.forEach((nid) => pendingDeletedNoteIds.delete(nid));
        batchDelFolderIds.forEach((fid) => pendingDeletedFolderIds.delete(fid));
        batchDelBookmarkIds.forEach((bid) => pendingDeletedBookmarkIds.delete(bid));
        batchDelBookmarkCategoryIds.forEach((cid) => pendingDeletedBookmarkCategoryIds.delete(cid));
        persistPendingDeletions();

        if (res.mergedNotes) {
          const deletedSet = new Set(pendingDeletedNoteIds);
          const inFlightModifiedNotes = new Map<string, Note>();
          notes.value.forEach((localN) => {
            const dirtySeq = noteDirtySeq.get(localN.id) || 0;
            const deletedSeq = noteDeletedSeq.get(localN.id) || 0;
            if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
              inFlightModifiedNotes.set(localN.id, localN);
            }
          });
          const mergedIds = new Set<string>();
          const nextNotes = res.mergedNotes
            .filter((n) => {
              if (deletedSet.has(n.id)) return false;
              if ((noteDeletedSeq.get(n.id) || 0) > syncStartSeq) return false;
              if (n.isDeleted && res.deletedNotes?.[n.id]) return false;
              return true;
            })
            .map((n) => {
              mergedIds.add(n.id);
              return inFlightModifiedNotes.get(n.id) || n;
            });
          inFlightModifiedNotes.forEach((localN, id) => {
            if (!mergedIds.has(id) && !deletedSet.has(id) && (noteDeletedSeq.get(id) || 0) <= syncStartSeq) {
              nextNotes.unshift(localN);
            }
          });
          notes.value = nextNotes;
        }

        if (res.mergedFolders) {
          const deletedFSet = new Set(pendingDeletedFolderIds);
          const inFlightModifiedFolders = new Map<string, Folder>();
          folders.value.forEach((localF) => {
            const dirtySeq = folderDirtySeq.get(localF.id) || 0;
            const deletedSeq = folderDeletedSeq.get(localF.id) || 0;
            if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
              inFlightModifiedFolders.set(localF.id, localF);
            }
          });
          const mergedFIds = new Set<string>();
          const nextFolders = res.mergedFolders
            .filter((f) => !deletedFSet.has(f.id) && (folderDeletedSeq.get(f.id) || 0) <= syncStartSeq)
            .map((f) => {
              mergedFIds.add(f.id);
              return inFlightModifiedFolders.get(f.id) || f;
            });
          inFlightModifiedFolders.forEach((localF, id) => {
            if (!mergedFIds.has(id) && !deletedFSet.has(id) && (folderDeletedSeq.get(id) || 0) <= syncStartSeq) {
              nextFolders.push(localF);
            }
          });
          folders.value = normalizeFolderOrders(nextFolders);
        }

        if (res.mergedBookmarkCategories) {
          const deletedCatSet = new Set(pendingDeletedBookmarkCategoryIds);
          const inFlightCats = new Map<string, BookmarkCategory>();
          bookmarkCategories.value.forEach((localC) => {
            const dirtySeq = bookmarkCategoryDirtySeq.get(localC.id) || 0;
            const deletedSeq = bookmarkCategoryDeletedSeq.get(localC.id) || 0;
            if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
              inFlightCats.set(localC.id, localC);
            }
          });
          const mergedCatIds = new Set<string>();
          const nextCats = res.mergedBookmarkCategories
            .filter((c) => !deletedCatSet.has(c.id) && (bookmarkCategoryDeletedSeq.get(c.id) || 0) <= syncStartSeq)
            .map((c) => {
              mergedCatIds.add(c.id);
              return inFlightCats.get(c.id) || c;
            });
          inFlightCats.forEach((localC, id) => {
            if (!mergedCatIds.has(id) && !deletedCatSet.has(id) && (bookmarkCategoryDeletedSeq.get(id) || 0) <= syncStartSeq) {
              nextCats.push(localC);
            }
          });
          bookmarkCategories.value = normalizeBookmarkCategoryOrders(nextCats);
        }

        if (res.mergedBookmarks) {
          const deletedBmSet = new Set(pendingDeletedBookmarkIds);
          const inFlightBms = new Map<string, Bookmark>();
          bookmarks.value.forEach((localB) => {
            const dirtySeq = bookmarkDirtySeq.get(localB.id) || 0;
            const deletedSeq = bookmarkDeletedSeq.get(localB.id) || 0;
            if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
              inFlightBms.set(localB.id, localB);
            }
          });
          const mergedBmIds = new Set<string>();
          const nextBms = res.mergedBookmarks
            .filter((b) => !deletedBmSet.has(b.id) && (bookmarkDeletedSeq.get(b.id) || 0) <= syncStartSeq)
            .map((b) => {
              mergedBmIds.add(b.id);
              return inFlightBms.get(b.id) || b;
            });
          inFlightBms.forEach((localB, id) => {
            if (!mergedBmIds.has(id) && !deletedBmSet.has(id) && (bookmarkDeletedSeq.get(id) || 0) <= syncStartSeq) {
              nextBms.unshift(localB);
            }
          });
          bookmarks.value = nextBms;
        }

        cloudConfig.value.lastSyncedAt = res.serverTime || Date.now();
        lastVisibilitySyncAt = Date.now();
        await nextTick();
        isApplyingRemoteSync.value = false;

        if (hasAnyPendingSyncItems()) {
          hasQueuedChangesDuringSync = true;
          syncStatus.value = 'unsynced';
        } else {
          syncStatus.value = 'synced';
        }
      } else {
        // Keep pendingModified* and pendingDeleted* intact so next sync retries them!
        syncStatus.value = 'error';
      }
    } catch (e) {
      syncStatus.value = 'error';
    } finally {
      isSyncing.value = false;
      isApplyingRemoteSync.value = false;
      if (hasQueuedChangesDuringSync) {
        hasQueuedChangesDuringSync = false;
        triggerAutoSyncDebounced();
      }
    }
  }

  // Trigger Debounced Sync when changes happen in Cloud Mode
  function triggerAutoSyncDebounced(options?: {
    noteId?: string;
    noteIds?: string[];
    folderId?: string;
    folderIds?: string[];
    bookmarkId?: string;
    bookmarkIds?: string[];
    bookmarkCategoryId?: string;
    bookmarkCategoryIds?: string[];
    deletedNoteId?: string;
    deletedNoteIds?: string[];
    deletedFolderId?: string;
    deletedFolderIds?: string[];
    deletedBookmarkId?: string;
    deletedBookmarkIds?: string[];
    deletedBookmarkCategoryId?: string;
    deletedBookmarkCategoryIds?: string[];
  }) {
    let deletionsUpdated = false;
    if (options?.noteId) {
      pendingModifiedNoteIds.add(options.noteId);
      noteDirtySeq.set(options.noteId, ++globalDirtySeq);
    }
    if (options?.noteIds && Array.isArray(options.noteIds)) {
      options.noteIds.forEach((id) => {
        pendingModifiedNoteIds.add(id);
        noteDirtySeq.set(id, ++globalDirtySeq);
      });
    }
    if (options?.folderId) {
      pendingModifiedFolderIds.add(options.folderId);
      folderDirtySeq.set(options.folderId, ++globalDirtySeq);
    }
    if (options?.folderIds && Array.isArray(options.folderIds)) {
      options.folderIds.forEach((id) => {
        pendingModifiedFolderIds.add(id);
        folderDirtySeq.set(id, ++globalDirtySeq);
      });
    }
    if (options?.bookmarkId) {
      pendingModifiedBookmarkIds.add(options.bookmarkId);
      bookmarkDirtySeq.set(options.bookmarkId, ++globalDirtySeq);
    }
    if (options?.bookmarkIds && Array.isArray(options.bookmarkIds)) {
      options.bookmarkIds.forEach((id) => {
        pendingModifiedBookmarkIds.add(id);
        bookmarkDirtySeq.set(id, ++globalDirtySeq);
      });
    }
    if (options?.bookmarkCategoryId) {
      pendingModifiedBookmarkCategoryIds.add(options.bookmarkCategoryId);
      bookmarkCategoryDirtySeq.set(options.bookmarkCategoryId, ++globalDirtySeq);
    }
    if (options?.bookmarkCategoryIds && Array.isArray(options.bookmarkCategoryIds)) {
      options.bookmarkCategoryIds.forEach((id) => {
        pendingModifiedBookmarkCategoryIds.add(id);
        bookmarkCategoryDirtySeq.set(id, ++globalDirtySeq);
      });
    }
    if (options?.deletedNoteId) {
      pendingDeletedNoteIds.add(options.deletedNoteId);
      pendingModifiedNoteIds.delete(options.deletedNoteId);
      noteDeletedSeq.set(options.deletedNoteId, ++globalDirtySeq);
      deletionsUpdated = true;
    }
    if (options?.deletedNoteIds && Array.isArray(options.deletedNoteIds)) {
      options.deletedNoteIds.forEach((id) => {
        pendingDeletedNoteIds.add(id);
        pendingModifiedNoteIds.delete(id);
        noteDeletedSeq.set(id, ++globalDirtySeq);
      });
      deletionsUpdated = true;
    }
    if (options?.deletedFolderId) {
      pendingDeletedFolderIds.add(options.deletedFolderId);
      pendingModifiedFolderIds.delete(options.deletedFolderId);
      folderDeletedSeq.set(options.deletedFolderId, ++globalDirtySeq);
      deletionsUpdated = true;
    }
    if (options?.deletedFolderIds && Array.isArray(options.deletedFolderIds)) {
      options.deletedFolderIds.forEach((id) => {
        pendingDeletedFolderIds.add(id);
        pendingModifiedFolderIds.delete(id);
        folderDeletedSeq.set(id, ++globalDirtySeq);
      });
      deletionsUpdated = true;
    }
    if (options?.deletedBookmarkId) {
      pendingDeletedBookmarkIds.add(options.deletedBookmarkId);
      pendingModifiedBookmarkIds.delete(options.deletedBookmarkId);
      bookmarkDeletedSeq.set(options.deletedBookmarkId, ++globalDirtySeq);
      deletionsUpdated = true;
    }
    if (options?.deletedBookmarkIds && Array.isArray(options.deletedBookmarkIds)) {
      options.deletedBookmarkIds.forEach((id) => {
        pendingDeletedBookmarkIds.add(id);
        pendingModifiedBookmarkIds.delete(id);
        bookmarkDeletedSeq.set(id, ++globalDirtySeq);
      });
      deletionsUpdated = true;
    }
    if (options?.deletedBookmarkCategoryId) {
      pendingDeletedBookmarkCategoryIds.add(options.deletedBookmarkCategoryId);
      pendingModifiedBookmarkCategoryIds.delete(options.deletedBookmarkCategoryId);
      bookmarkCategoryDeletedSeq.set(options.deletedBookmarkCategoryId, ++globalDirtySeq);
      deletionsUpdated = true;
    }
    if (options?.deletedBookmarkCategoryIds && Array.isArray(options.deletedBookmarkCategoryIds)) {
      options.deletedBookmarkCategoryIds.forEach((id) => {
        pendingDeletedBookmarkCategoryIds.add(id);
        pendingModifiedBookmarkCategoryIds.delete(id);
        bookmarkCategoryDeletedSeq.set(id, ++globalDirtySeq);
      });
      deletionsUpdated = true;
    }

    if (deletionsUpdated) {
      persistPendingDeletions();
    }

    if (isApplyingRemoteSync.value) {
      return;
    }

    if (!isCloudConfigured()) {
      syncStatus.value = 'unconfigured';
      return;
    }

    // Ignore pure local UI watcher triggers (like folder expand/collapse) when nothing is queued for sync
    if (!options && !hasAnyPendingSyncItems()) {
      return;
    }

    if (!cloudConfig.value.autoSync) {
      syncStatus.value = 'unsynced';
      return;
    }

    syncStatus.value = 'unsynced';

    if (isSyncing.value) {
      hasQueuedChangesDuringSync = true;
      return;
    }

    if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);
    autoSyncDebounceTimer = setTimeout(() => {
      autoSyncDebounceTimer = null;
      executeAutoSyncBatch();
    }, 1500);
  }

  // Top-most / first root folder ID (the first root folder visible at the top of the sidebar)
  const firstRootFolderId = computed<string>(() => {
    const root = folders.value.find((f) => !f.parentId);
    return root?.id || folders.value[0]?.id || '';
  });

  // Active folder object
  const activeFolder = computed(() => {
    const found = folders.value.find((f) => f.id === activeFolderId.value);
    if (found) return found;
    const root = folders.value.find((f) => !f.parentId);
    return root || folders.value[0] || null;
  });

  // Active Note object
  const activeNote = computed(() => {
    return notes.value.find((n) => n.id === activeNoteId.value) || null;
  });

  // Hierarchical Folder Helpers
  function getFolderAncestors(folderId: string): Folder[] {
    const ancestors: Folder[] = [];
    const validIds = new Set(folders.value.map((f) => f.id));
    const firstId = firstRootFolderId.value;
    const visited = new Set<string>();

    let curr = folders.value.find((f) => f.id === folderId);
    if (!curr) {
      if (firstId) {
        const firstF = folders.value.find((f) => f.id === firstId);
        if (firstF) return [firstF];
      }
      return [];
    }

    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      ancestors.unshift(curr);
      if (curr.parentId) {
        if (validIds.has(curr.parentId)) {
          curr = folders.value.find((f) => f.id === curr!.parentId);
        } else {
          // Parent folder does not exist: attach under first folder
          if (firstId && curr.id !== firstId) {
            const firstFolderObj = folders.value.find((f) => f.id === firstId);
            if (firstFolderObj && !visited.has(firstFolderObj.id)) {
              ancestors.unshift(firstFolderObj);
            }
          }
          break;
        }
      } else {
        break;
      }
    }
    return ancestors;
  }

  function getFolderFullPath(folderId: string): string {
    const validIds = new Set(folders.value.map((f) => f.id));
    const firstId = firstRootFolderId.value;
    if (!folderId || !validIds.has(folderId)) {
      if (firstId) {
        const firstF = folders.value.find((f) => f.id === firstId);
        return ['我的笔记', firstF?.name || ''].filter(Boolean).join(' > ');
      }
      return '我的笔记';
    }
    const ancestors = getFolderAncestors(folderId);
    if (ancestors.length === 0) return '我的笔记';
    return ['我的笔记', ...ancestors.map((a) => a.name)].join(' > ');
  }

  function getSubFolders(parentId: string | null = null): Folder[] {
    const validIds = new Set(folders.value.map((f) => f.id));
    const firstId = firstRootFolderId.value;

    if (!parentId) {
      return folders.value
        .filter((f) => !f.parentId)
        .sort(compareFolders);
    }

    return folders.value
      .filter((f) => {
        if (f.parentId === parentId) return true;
        // If querying for the first folder, also include any orphaned subfolders
        if (parentId === firstId && f.parentId && !validIds.has(f.parentId) && f.id !== firstId) {
          return true;
        }
        return false;
      })
      .sort(compareFolders);
  }

  function getAllDescendantFolderIds(folderId: string): string[] {
    const directChildren = getSubFolders(folderId);
    let ids: string[] = directChildren.map((c) => c.id);
    directChildren.forEach((c) => {
      ids = ids.concat(getAllDescendantFolderIds(c.id));
    });
    return ids;
  }

  // Folder note counts (including subfolders or direct)
  const getFolderNoteCount = (folderId: string) => {
    const firstId = firstRootFolderId.value;
    const validIds = new Set(folders.value.map((f) => f.id));
    const allFolderIds = [folderId, ...getAllDescendantFolderIds(folderId)];

    return notes.value.filter((n) => {
      if (n.isDeleted) return false;
      if (allFolderIds.includes(n.folderId)) return true;
      // If checking the first folder, also count orphaned notes whose folderId doesn't exist
      if (folderId === firstId && (!n.folderId || !validIds.has(n.folderId))) {
        return true;
      }
      return false;
    }).length;
  };

  const getDirectFolderNoteCount = (folderId: string) => {
    const firstId = firstRootFolderId.value;
    const validIds = new Set(folders.value.map((f) => f.id));

    return notes.value.filter((n) => {
      if (n.isDeleted) return false;
      if (n.folderId === folderId) return true;
      if (folderId === firstId && (!n.folderId || !validIds.has(n.folderId))) {
        return true;
      }
      return false;
    }).length;
  };

  // Category counts
  const starredNotesCount = computed(() => notes.value.filter((n) => n.isStarred && !n.isDeleted).length);
  const deletedNotesCount = computed(() => notes.value.filter((n) => n.isDeleted).length);
  const bookmarksCount = computed(() => bookmarks.value.length);

  function getBookmarkCategoryName(categoryId: string): string {
    if (!categoryId) return '未分类';
    const found = bookmarkCategories.value.find((c) => c.id === categoryId);
    return found ? found.name : '未分类';
  }

  // Root folders (sorted top-to-bottom according to folder.order)
  const rootFolders = computed<Folder[]>(() => {
    return folders.value
      .filter((f) => !f.parentId)
      .sort(compareFolders);
  });

  // Frequent Folders list resolved from IDs
  const frequentFolders = computed<Folder[]>(() => {
    return frequentFolderIds.value
      .map((id) => folders.value.find((f) => f.id === id))
      .filter((f): f is Folder => Boolean(f));
  });

  function isFolderFrequent(folderId: string): boolean {
    return frequentFolderIds.value.includes(folderId);
  }

  // Trigger sync of frequent folders to cloud and IDB
  function syncFrequentFoldersToCloud() {
    saveFrequentFoldersToIDB(frequentFolderIds.value).catch(console.error);
    try {
      localStorage.setItem(STORAGE_KEY_FREQUENT_FOLDERS, JSON.stringify(frequentFolderIds.value));
    } catch {}

    if (isAutoSyncActive()) {
      saveFrequentFoldersToCloud(cloudConfig.value, frequentFolderIds.value).catch((err) => {
        console.warn('Frequent folder cloud sync warning:', err);
      });
    } else if (isCloudConfigured()) {
      syncStatus.value = 'unsynced';
    }
  }

  function toggleFrequentFolder(folderId: string) {
    const idx = frequentFolderIds.value.indexOf(folderId);
    const targetFolder = folders.value.find((f) => f.id === folderId);
    if (idx !== -1) {
      frequentFolderIds.value.splice(idx, 1);
      showToast(`已从常用目录移除 "${targetFolder?.name || '文件夹'}"`);
      if (isAutoSyncActive()) {
        deleteFrequentFolderFromCloud(cloudConfig.value, folderId).catch(() => {});
      }
    } else {
      frequentFolderIds.value.push(folderId);
      showToast(`已将 "${targetFolder?.name || '文件夹'}" 添加至常用目录`);
    }
    syncFrequentFoldersToCloud();
  }

  function addFrequentFolder(folderId: string, atIndex?: number) {
    const existingIdx = frequentFolderIds.value.indexOf(folderId);
    const targetFolder = folders.value.find((f) => f.id === folderId);
    if (existingIdx !== -1) {
      if (typeof atIndex === 'number' && atIndex !== existingIdx) {
        reorderFrequentFolders(existingIdx, atIndex);
      }
      return;
    }
    if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= frequentFolderIds.value.length) {
      frequentFolderIds.value.splice(atIndex, 0, folderId);
    } else {
      frequentFolderIds.value.push(folderId);
    }
    showToast(`已将 "${targetFolder?.name || '文件夹'}" 添加至常用目录`);
    syncFrequentFoldersToCloud();
  }

  function removeFrequentFolder(folderId: string) {
    const idx = frequentFolderIds.value.indexOf(folderId);
    if (idx !== -1) {
      frequentFolderIds.value.splice(idx, 1);
      const targetFolder = folders.value.find((f) => f.id === folderId);
      showToast(`已从常用目录移除 "${targetFolder?.name || '文件夹'}"`);
      if (isAutoSyncActive()) {
        deleteFrequentFolderFromCloud(cloudConfig.value, folderId).catch(() => {});
      }
      syncFrequentFoldersToCloud();
    }
  }

  function reorderFrequentFolders(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= frequentFolderIds.value.length) return;
    const clampedTo = Math.max(0, Math.min(toIndex, frequentFolderIds.value.length - 1));
    if (fromIndex === clampedTo) return;
    const item = frequentFolderIds.value.splice(fromIndex, 1)[0];
    frequentFolderIds.value.splice(clampedTo, 0, item);
    showToast('常用目录排序已更新并同步');
    syncFrequentFoldersToCloud();
  }

  function setFrequentFolderIds(newIds: string[]) {
    frequentFolderIds.value = [...newIds];
    syncFrequentFoldersToCloud();
  }

  // Clickable Breadcrumbs items
  const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    const defaultRootFolderId = firstRootFolderId.value;

    if (searchQuery.value.trim()) {
      return [
        {
          id: 'root-notes',
          label: '我的笔记',
          view: 'folder',
          folderId: defaultRootFolderId,
          clickable: true,
        },
        {
          id: 'search-crumb',
          label: `搜索结果: "${searchQuery.value.trim()}"`,
          view: 'search',
          clickable: false,
        },
      ];
    }

    if (currentView.value === 'starred') {
      return [
        { id: 'root', label: '我的笔记', view: 'folder', folderId: defaultRootFolderId, clickable: true },
        { id: 'starred', label: '我的标星', view: 'starred', clickable: false },
      ];
    }
    if (currentView.value === 'trash') {
      return [
        { id: 'root', label: '我的笔记', view: 'folder', folderId: defaultRootFolderId, clickable: true },
        { id: 'trash', label: '我的回收站', view: 'trash', clickable: false },
      ];
    }
    if (currentView.value === 'timeline') {
      return [
        { id: 'root', label: '我的笔记', view: 'folder', folderId: defaultRootFolderId, clickable: true },
        { id: 'timeline', label: '文件时间线', view: 'timeline', clickable: false },
      ];
    }
    if (currentView.value === 'bookmarks') {
      return [
        { id: 'root', label: '我的笔记', view: 'folder', folderId: defaultRootFolderId, clickable: true },
        { id: 'bookmarks', label: '网站书签', view: 'bookmarks', clickable: false },
      ];
    }

    // Folder view hierarchy
    const items: BreadcrumbItem[] = [
      {
        id: 'root-all',
        label: '我的笔记',
        view: 'folder',
        folderId: defaultRootFolderId,
        clickable: true,
      },
    ];

    if (activeFolderId.value) {
      const ancestors = getFolderAncestors(activeFolderId.value);
      ancestors.forEach((anc, idx) => {
        const isLast = idx === ancestors.length - 1;
        items.push({
          id: anc.id,
          label: anc.name,
          view: 'folder',
          folderId: anc.id,
          clickable: !isLast,
        });
      });
    }

    return items;
  });

  // Filtered and sorted notes for current view
  const displayedNotes = computed(() => {
    let result = notes.value;

    // View based filtering
    if (currentView.value === 'trash') {
      result = result.filter((n) => n.isDeleted);
    } else {
      // Non-trash views: exclude deleted
      result = result.filter((n) => !n.isDeleted);

      if (currentView.value === 'folder') {
        if (activeFolderId.value) {
          const firstId = firstRootFolderId.value;
          const validFolderIds = new Set(folders.value.map((f) => f.id));
          result = result.filter((n) => {
            if (n.folderId === activeFolderId.value) return true;
            // If viewing the first folder, also display orphaned notes whose folder doesn't exist
            if (activeFolderId.value === firstId && (!n.folderId || !validFolderIds.has(n.folderId))) {
              return true;
            }
            return false;
          });
        }
      } else if (currentView.value === 'starred') {
        result = result.filter((n) => n.isStarred);
      }
    }

    // Search filtering
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      result = result.filter((n) => {
        const titleMatch = n.title.toLowerCase().includes(q);
        const tagMatch = n.tags.some((t) => t.toLowerCase().includes(q));
        if (titleMatch || tagMatch) return true;
        if (n.format === 'drawio' || n.type === 'drawio') {
          const textNodes = extractDrawioTextNodes(n.content);
          return textNodes.some((t) => t.toLowerCase().includes(q));
        }
        return n.content.toLowerCase().includes(q);
      });
    }

    // Secondary filters
    if (filterOptions.value.starredOnly) {
      result = result.filter((n) => n.isStarred);
    }
    if (filterOptions.value.format !== 'all') {
      result = result.filter((n) => n.format === filterOptions.value.format);
    }
    if (filterOptions.value.tag) {
      result = result.filter((n) => n.tags.includes(filterOptions.value.tag!));
    }

    // Sorting
    return [...result].sort((a, b) => {
      let comparison = 0;
      if (sortField.value === 'createdAt') {
        comparison = a.createdAt.localeCompare(b.createdAt);
      } else if (sortField.value === 'updatedAt') {
        comparison = a.updatedAt.localeCompare(b.updatedAt);
      } else if (sortField.value === 'title') {
        comparison = a.title.localeCompare(b.title, 'zh-CN');
      }
      return sortOrder.value === 'desc' ? -comparison : comparison;
    });
  });

  // Global Search grouped with priority for current folder, other folders & bookmarks
  const globalSearchResults = computed<{
    currentFolderMatches: SearchResultItem[];
    otherMatches: SearchResultItem[];
    bookmarkMatches: BookmarkSearchResultItem[];
    totalCount: number;
  }>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) {
      return { currentFolderMatches: [], otherMatches: [], bookmarkMatches: [], totalCount: 0 };
    }

    const availableNotes = notes.value.filter((n) => !n.isDeleted);
    const currentMatches: SearchResultItem[] = [];
    const otherMatches: SearchResultItem[] = [];

    availableNotes.forEach((note) => {
      const titleLower = note.title.toLowerCase();
      let contentForSearch = note.content;
      if (note.format === 'drawio' || note.type === 'drawio') {
        const textNodes = extractDrawioTextNodes(note.content);
        contentForSearch = textNodes.join(' ') || note.title;
      }
      const contentLower = contentForSearch.toLowerCase();
      const tagMatch = note.tags.some((t) => t.toLowerCase().includes(q));

      if (titleLower.includes(q) || contentLower.includes(q) || tagMatch) {
        // Build content snippet
        let snippet = '';
        const idx = contentLower.indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 25);
          const end = Math.min(contentForSearch.length, idx + q.length + 35);
          snippet = (start > 0 ? '...' : '') + contentForSearch.substring(start, end).replace(/\n/g, ' ') + (end < contentForSearch.length ? '...' : '');
        } else {
          snippet = contentForSearch.slice(0, 50).replace(/\n/g, ' ') + '...';
        }

        const validIds = new Set(folders.value.map((f) => f.id));
        const firstId = firstRootFolderId.value;
        const isCurrent =
          currentView.value === 'folder' &&
          (note.folderId === activeFolderId.value ||
            (activeFolderId.value === firstId && (!note.folderId || !validIds.has(note.folderId))));
        const item: SearchResultItem = {
          note,
          folderPath: getFolderFullPath(note.folderId),
          isCurrentFolder: isCurrent,
          matchedTitleSnippet: note.title,
          matchedContentSnippet: snippet,
        };

        if (isCurrent) {
          currentMatches.push(item);
        } else {
          otherMatches.push(item);
        }
      }
    });

    const bookmarkMatches: BookmarkSearchResultItem[] = [];
    bookmarks.value.forEach((bm) => {
      const host = extractBookmarkHost(bm.url);
      const titleMatch = (bm.title || '').toLowerCase().includes(q);
      const urlMatch = (bm.url || '').toLowerCase().includes(q) || host.toLowerCase().includes(q);
      const descMatch = (bm.description || '').toLowerCase().includes(q);
      const tagMatch = (bm.tags || []).some((t) => t.toLowerCase().includes(q));
      if (titleMatch || urlMatch || descMatch || tagMatch) {
        bookmarkMatches.push({
          bookmark: bm,
          categoryName: getBookmarkCategoryName(bm.categoryId),
          host,
        });
      }
    });

    return {
      currentFolderMatches: currentMatches,
      otherMatches: otherMatches,
      bookmarkMatches,
      totalCount: currentMatches.length + otherMatches.length + bookmarkMatches.length,
    };
  });

  // Actions
  function selectFolder(folderId: string) {
    currentView.value = 'folder';
    activeFolderId.value = folderId;
    searchQuery.value = '';
    selectedNoteIds.value = [];
    activeTabId.value = 'workspace';
  }

  function selectView(view: ViewType) {
    currentView.value = view;
    searchQuery.value = '';
    selectedNoteIds.value = [];
    activeTabId.value = 'workspace';
  }

  function handleBreadcrumbClick(item: BreadcrumbItem) {
    if (!item.clickable) return;
    if (item.id === 'root-all' || item.id === 'root' || item.id === 'root-notes') {
      const targetId = firstRootFolderId.value;
      if (targetId) {
        selectFolder(targetId);
      } else {
        selectView('folder');
      }
    } else if (item.folderId) {
      selectFolder(item.folderId);
    } else if (item.view) {
      selectView(item.view);
    }
  }

  function formatDateTime(d = new Date()) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function stampNoteMutation(note: Note) {
    note.updatedAt = formatDateTime();
    note.updatedAtMs = Date.now();
  }

  function stampFolderMutation(folder: Folder) {
    folder.updatedAt = formatDateTime();
    folder.updatedAtMs = Date.now();
  }

  function resolveTargetFolderId(folderId?: string): string {
    if (folderId && folders.value.some((f) => f.id === folderId)) {
      return folderId;
    }
    if (activeFolderId.value && folders.value.some((f) => f.id === activeFolderId.value)) {
      return activeFolderId.value;
    }
    if (firstRootFolderId.value) {
      return firstRootFolderId.value;
    }
    if (folders.value.length > 0) {
      return folders.value[0].id;
    }
    // If no folders exist, create a clean default root folder
    const nowStr = formatDateTime();
    const nowMs = Date.now();
    const defaultFolder: Folder = {
      id: 'folder-' + nowMs,
      name: '我的笔记',
      parentId: null,
      order: 1,
      isOpen: true,
      createdAt: nowStr,
      updatedAt: nowStr,
      updatedAtMs: nowMs,
    };
    folders.value.push(defaultFolder);
    activeFolderId.value = defaultFolder.id;
    triggerAutoSyncDebounced({ folderId: defaultFolder.id });
    return defaultFolder.id;
  }

  function createNewNote(title = '无标题笔记', folderId?: string) {
    const targetFolder = resolveTargetFolderId(folderId);
    const now = formatDateTime();
    const nowMs = Date.now();
    const newNote: Note = {
      id: 'note-' + nowMs,
      title: title,
      content: `# ${title}\n\n在这里开始编写你的笔记内容...\n`,
      folderId: targetFolder,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
      isStarred: false,
      isDeleted: false,
      tags: [],
      format: 'markdown',
    };

    notes.value.unshift(newNote);
    openNoteTab(newNote, 'split');
    showToast('新建笔记成功');
    triggerAutoSyncDebounced({ noteId: newNote.id });
    return newNote;
  }

  function createNewMindMap(title = '无标题思维导图', folderId?: string) {
    const targetFolder = resolveTargetFolderId(folderId);
    const now = formatDateTime();
    const nowMs = Date.now();
    const defaultMindMapJson = {
      root: {
        data: { text: title, expandState: 'expand' },
        children: [
          {
            data: { text: '分支主题 1', priority: 1 },
            children: [
              { data: { text: '子主题 1.1' } },
              { data: { text: '子主题 1.2' } }
            ]
          },
          {
            data: { text: '分支主题 2', priority: 2 },
            children: [
              { data: { text: '子主题 2.1' } }
            ]
          },
          {
            data: { text: '分支主题 3', priority: 3 },
            children: [
              { data: { text: '子主题 3.1' } }
            ]
          }
        ]
      },
      template: 'default',
      theme: 'fresh-green'
    };

    const newNote: Note = {
      id: 'note-' + nowMs,
      title: title,
      content: JSON.stringify(defaultMindMapJson, null, 2),
      folderId: targetFolder,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
      isStarred: false,
      isDeleted: false,
      tags: ['思维导图'],
      format: 'mindmap',
      type: 'mindmap',
    };

    notes.value.unshift(newNote);
    openNoteTab(newNote);
    showToast('新建思维导图成功');
    triggerAutoSyncDebounced({ noteId: newNote.id });
    return newNote;
  }

  function createNewDrawioDiagram(title = '无标题图表', folderId?: string, templateId = 'flowchart') {
    const targetFolder = resolveTargetFolderId(folderId);
    const now = formatDateTime();
    const nowMs = Date.now();
    const defaultXml = createDefaultDrawioXml(title, templateId);

    const newNote: Note = {
      id: 'note-' + nowMs,
      title: title,
      content: defaultXml,
      folderId: targetFolder,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
      isStarred: false,
      isDeleted: false,
      tags: ['Draw.io', '流程图'],
      format: 'drawio',
      type: 'drawio',
    };

    notes.value.unshift(newNote);
    openNoteTab(newNote);
    showToast('新建 Draw.io 图表成功');
    triggerAutoSyncDebounced({ noteId: newNote.id });
    return newNote;
  }

  function getNoteOpenUrl(noteId: string): string {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    return `${origin}${pathname}?noteId=${encodeURIComponent(noteId)}`;
  }

  function openNoteInNewTab(note: Note) {
    // Save state to localStorage immediately before opening new tab so new tab loads newest changes
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes.value));
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders.value));
    } catch {}

    const targetUrl = getNoteOpenUrl(note.id);
    const newWindow = window.open(targetUrl, '_blank');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      // If popup is blocked by browser, fallback to workspace tab and notify user
      openNoteTab(note, 'split');
      showToast('浏览器已拦截弹窗，已在当前标签页打开');
    }
  }

  function openNoteTab(note: Note, mode: 'split' | 'edit' | 'preview' = 'split') {
    if (!note || note.isDeleted) return;
    if (!openTabIds.value.includes(note.id)) {
      openTabIds.value = [...openTabIds.value, note.id];
    }
    activeTabId.value = note.id;
    activeNoteId.value = note.id;
    editorMode.value = mode;
  }

  function switchTab(tabId: string) {
    if (tabId === 'workspace') {
      activeTabId.value = 'workspace';
      return;
    }
    if (openTabIds.value.includes(tabId)) {
      activeTabId.value = tabId;
      activeNoteId.value = tabId;
    }
  }

  function closeTab(tabId: string) {
    const idx = openTabIds.value.indexOf(tabId);
    if (idx === -1) return;
    const nextIds = openTabIds.value.filter((id) => id !== tabId);
    openTabIds.value = nextIds;

    if (activeTabId.value === tabId) {
      if (nextIds.length === 0) {
        activeTabId.value = 'workspace';
        activeNoteId.value = null;
      } else {
        const nextActive = nextIds[Math.min(idx, nextIds.length - 1)];
        activeTabId.value = nextActive;
        activeNoteId.value = nextActive;
      }
    }
  }

  function closeOtherTabs(tabId: string) {
    if (tabId === 'workspace') {
      closeAllTabs();
      return;
    }
    if (openTabIds.value.includes(tabId)) {
      openTabIds.value = [tabId];
      activeTabId.value = tabId;
      activeNoteId.value = tabId;
    }
  }

  function closeRightTabs(tabId: string) {
    if (tabId === 'workspace') {
      closeAllTabs();
      return;
    }
    const idx = openTabIds.value.indexOf(tabId);
    if (idx === -1) return;
    const nextIds = openTabIds.value.slice(0, idx + 1);
    openTabIds.value = nextIds;
    if (activeTabId.value !== 'workspace' && !nextIds.includes(activeTabId.value)) {
      activeTabId.value = tabId;
      activeNoteId.value = tabId;
    }
  }

  function closeAllTabs() {
    openTabIds.value = [];
    activeTabId.value = 'workspace';
    activeNoteId.value = null;
  }

  function reorderTabs(fromIndex: number, toIndex: number) {
    if (
      fromIndex < 0 ||
      fromIndex >= openTabIds.value.length ||
      toIndex < 0 ||
      toIndex >= openTabIds.value.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const next = [...openTabIds.value];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    openTabIds.value = next;
  }

  function updateNote(id: string, updates: Partial<Note>) {
    const idx = notes.value.findIndex((n) => n.id === id);
    if (idx !== -1) {
      notes.value[idx] = {
        ...notes.value[idx],
        ...updates,
        updatedAt: formatDateTime(),
        updatedAtMs: Date.now(),
      };
      triggerAutoSyncDebounced({ noteId: id });
    }
  }

  function toggleStar(noteId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.isStarred = !note.isStarred;
      stampNoteMutation(note);
      showToast(note.isStarred ? '已添加标星' : '已取消标星');
      triggerAutoSyncDebounced({ noteId });
    }
  }

  function moveToTrash(noteId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      const now = formatDateTime();
      note.isDeleted = true;
      note.deletedAt = now;
      note.updatedAt = now;
      note.updatedAtMs = Date.now();
      closeTab(noteId);
      showToast('已移入回收站');
      triggerAutoSyncDebounced({ noteId });
    }
  }

  function restoreFromTrash(noteId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.isDeleted = false;
      note.deletedAt = undefined;
      stampNoteMutation(note);
      showToast('已成功还原笔记');
      triggerAutoSyncDebounced({ noteId });
    }
  }

  async function permanentlyDeleteNote(noteId: string) {
    notes.value = notes.value.filter((n) => n.id !== noteId);
    closeTab(noteId);
    showToast('笔记已彻底删除');
    triggerAutoSyncDebounced({ deletedNoteId: noteId });
  }

  async function emptyTrash() {
    const trashNotes = notes.value.filter((n) => n.isDeleted);
    const trashIds = trashNotes.map((n) => n.id);
    if (trashIds.length === 0) {
      showToast('回收站为空');
      return;
    }

    // 1. Record deletion sequence, remove from local memory & persist pending deletion IDs immediately
    trashIds.forEach((id) => {
      pendingDeletedNoteIds.add(id);
      pendingModifiedNoteIds.delete(id);
      noteDeletedSeq.set(id, ++globalDirtySeq);
    });
    persistPendingDeletions();
    notes.value = notes.value.filter((n) => !n.isDeleted);

    // 2. If auto-sync is active, sync permanent deletion immediately
    if (isAutoSyncActive()) {
      syncStatus.value = 'syncing';
      try {
        const res = await emptyTrashOnCloud(cloudConfig.value, trashIds);
        if (res.success) {
          trashIds.forEach((id) => pendingDeletedNoteIds.delete(id));
          persistPendingDeletions();
          if (!hasAnyPendingSyncItems() && autoSyncDebounceTimer) {
            clearTimeout(autoSyncDebounceTimer);
            autoSyncDebounceTimer = null;
          }
          syncStatus.value = hasAnyPendingSyncItems() ? 'unsynced' : 'synced';
          cloudConfig.value.lastSyncedAt = Date.now();
          lastVisibilitySyncAt = Date.now();
          showToast('回收站已清空，云端数据已同步彻底删除');
        } else {
          triggerAutoSyncDebounced();
          showToast('本地回收站已清空，正在后台重试云端同步...');
        }
      } catch (err) {
        triggerAutoSyncDebounced();
        showToast('本地回收站已清空，后台将自动同步至云端');
      }
    } else if (isCloudConfigured()) {
      syncStatus.value = 'unsynced';
      showToast('本地回收站已清空（手动同步模式下将在下次同步时清理云端）');
    } else {
      showToast('回收站已清空');
    }
  }

  // Create folder or subfolder
  function createFolder(name: string, parentId: string | null = null) {
    if (!name.trim()) return;
    const targetParentId = parentId || null;
    const siblings = folders.value.filter((f) => (f.parentId || null) === targetParentId);
    const maxOrder = siblings.reduce((max, f) => Math.max(max, typeof f.order === 'number' ? f.order : 0), 0);
    const nowStr = formatDateTime();
    const nowMs = Date.now();

    const newFolder: Folder = {
      id: 'folder-' + nowMs,
      name: name.trim(),
      parentId: targetParentId,
      order: maxOrder + 1,
      isOpen: true,
      createdAt: nowStr,
      updatedAt: nowStr,
      updatedAtMs: nowMs,
    };
    folders.value.push(newFolder);
    normalizeFolderOrders(folders.value);

    // If has parent, ensure parent is open
    if (targetParentId) {
      const parent = folders.value.find((f) => f.id === targetParentId);
      if (parent) parent.isOpen = true;
    }

    // Mark all siblings in this group as modified to ensure continuous order sync to cloud
    const affectedSiblings = folders.value
      .filter((f) => (f.parentId || null) === targetParentId)
      .map((f) => {
        const folderObj = folders.value.find((x) => x.id === f.id);
        if (folderObj) stampFolderMutation(folderObj);
        return f.id;
      });

    // Save to IDB & LocalStorage immediately
    saveFoldersToIDB(folders.value).catch(console.error);
    try {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders.value));
    } catch {}

    activeFolderId.value = newFolder.id;
    currentView.value = 'folder';
    showToast(targetParentId ? `子文件夹 "${name}" 创建成功` : `文件夹 "${name}" 创建成功`);
    triggerAutoSyncDebounced({ folderIds: affectedSiblings });
  }

  function deleteFolder(folderId: string) {
    const folder = folders.value.find((f) => f.id === folderId);
    if (!folder) return;

    const parentId = folder.parentId || null;
    // Collect all descendant folder IDs
    const allFolderIds = [folderId, ...getAllDescendantFolderIds(folderId)];
    const now = formatDateTime();
    const nowMs = Date.now();
    const affectedNoteIds: string[] = [];

    // Move all notes inside these folders to trash and stamp updatedAt so cloud sync propagates deletion state
    notes.value.forEach((n) => {
      if (allFolderIds.includes(n.folderId)) {
        if (!n.isDeleted) {
          n.isDeleted = true;
          n.deletedAt = now;
        }
        n.updatedAt = now;
        n.updatedAtMs = nowMs;
        affectedNoteIds.push(n.id);
        closeTab(n.id);
      }
    });

    folders.value = folders.value.filter((f) => !allFolderIds.includes(f.id));
    normalizeFolderOrders(folders.value);
    frequentFolderIds.value = frequentFolderIds.value.filter((id) => !allFolderIds.includes(id));
    syncFrequentFoldersToCloud();
    if (allFolderIds.includes(activeFolderId.value)) {
      activeFolderId.value = folders.value[0]?.id || '';
    }

    // Mark remaining siblings in this group as modified to update continuous orders
    const remainingSiblings = folders.value
      .filter((f) => (f.parentId || null) === parentId)
      .map((f) => {
        stampFolderMutation(f);
        return f.id;
      });

    // Save to IDB & LocalStorage immediately
    saveFoldersToIDB(folders.value).catch(console.error);
    try {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders.value));
    } catch {}

    showToast(`文件夹 "${folder.name}" 及其子内容已删除`);
    triggerAutoSyncDebounced({
      deletedFolderIds: allFolderIds,
      folderIds: remainingSiblings,
      noteIds: affectedNoteIds,
    });
  }

  function renameFolder(folderId: string, newName: string) {
    const folder = folders.value.find((f) => f.id === folderId);
    if (folder && newName.trim()) {
      folder.name = newName.trim();
      stampFolderMutation(folder);
      normalizeFolderOrders(folders.value);

      // Save to IDB & LocalStorage immediately
      saveFoldersToIDB(folders.value).catch(console.error);
      try {
        localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders.value));
      } catch {}

      showToast('文件夹重命名成功');
      triggerAutoSyncDebounced({ folderId });
    }
  }

  // Move a folder or reorder relative to target folder / parent
  function moveFolder(
    draggedFolderId: string,
    targetParentId: string | null,
    position: 'inside' | 'before' | 'after' = 'inside',
    targetFolderId?: string
  ) {
    const draggedFolder = folders.value.find((f) => f.id === draggedFolderId);
    if (!draggedFolder) return;

    const oldParentId = draggedFolder.parentId || null;
    const result = reorderFolder(folders.value, draggedFolderId, targetParentId, position, targetFolderId);

    if (!result.success) {
      if (result.message) {
        showToast(result.message);
      }
      return;
    }

    // Collect all affected sibling folders whose order or parentId changed and stamp updatedAt
    const affectedFolderIds = result.affectedFolderIds || [draggedFolderId];
    affectedFolderIds.forEach((id) => {
      const f = folders.value.find((x) => x.id === id);
      if (f) stampFolderMutation(f);
    });

    // Save to IDB & LocalStorage immediately
    saveFoldersToIDB(folders.value).catch(console.error);
    try {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders.value));
    } catch {}

    if (position === 'inside') {
      if (targetParentId) {
        const parent = folders.value.find((f) => f.id === targetParentId);
        if (parent) parent.isOpen = true;
        if (oldParentId !== targetParentId) {
          showToast(`已将 "${draggedFolder.name}" 移动至 "${parent?.name || '文件夹'}"`);
        }
      } else {
        if (oldParentId !== null) {
          showToast(`已将 "${draggedFolder.name}" 移动至根目录`);
        }
      }
    } else {
      showToast(`已调整文件夹 "${draggedFolder.name}" 顺序`);
    }

    // 触发云端自动同步并更新所有同级目录的 order
    triggerAutoSyncDebounced({ folderIds: affectedFolderIds });
  }

  function toggleFolderCollapse(folderId: string) {
    const folder = folders.value.find((f) => f.id === folderId);
    if (folder) {
      folder.isOpen = !folder.isOpen;
    }
  }

  function openMoveModal(note: Note) {
    noteToMove.value = note;
    notesToMove.value = [note];
    isMoveModalOpen.value = true;
  }

  function openBatchMoveModal(selectedNotes: Note[]) {
    if (!selectedNotes.length) return;
    noteToMove.value = selectedNotes[0] || null;
    notesToMove.value = selectedNotes;
    isMoveModalOpen.value = true;
  }

  function moveNoteToFolder(noteId: string, targetFolderId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.folderId = targetFolderId;
      stampNoteMutation(note);
      isMoveModalOpen.value = false;
      const targetF = folders.value.find((f) => f.id === targetFolderId);
      showToast(`已将笔记移动到 "${targetF?.name || '文件夹'}"`);
      triggerAutoSyncDebounced({ noteId: note.id });
    }
  }

  function batchMoveNotesToFolder(noteIds: string[], targetFolderId: string) {
    if (!noteIds.length) return;
    const now = formatDateTime();
    const nowMs = Date.now();
    const modifiedIds: string[] = [];
    notes.value.forEach((note) => {
      if (noteIds.includes(note.id)) {
        note.folderId = targetFolderId;
        note.updatedAt = now;
        note.updatedAtMs = nowMs;
        modifiedIds.push(note.id);
      }
    });
    isMoveModalOpen.value = false;
    const targetF = folders.value.find((f) => f.id === targetFolderId);
    showToast(`已将 ${modifiedIds.length} 篇笔记移动到 "${targetF?.name || '文件夹'}"`);
    triggerAutoSyncDebounced({ noteIds: modifiedIds });
  }

  function batchToggleStar(noteIds: string[], forceState?: boolean) {
    if (!noteIds.length) return;
    const targetNotes = notes.value.filter((n) => noteIds.includes(n.id));
    if (!targetNotes.length) return;
    const shouldStar = forceState !== undefined ? forceState : targetNotes.some((n) => !n.isStarred);
    const now = formatDateTime();
    const nowMs = Date.now();
    const modifiedIds: string[] = [];
    targetNotes.forEach((n) => {
      n.isStarred = shouldStar;
      n.updatedAt = now;
      n.updatedAtMs = nowMs;
      modifiedIds.push(n.id);
    });
    showToast(shouldStar ? `已为 ${targetNotes.length} 篇笔记添加标星` : `已取消 ${targetNotes.length} 篇笔记的标星`);
    triggerAutoSyncDebounced({ noteIds: modifiedIds });
  }

  function batchMoveToTrash(noteIds: string[]) {
    if (!noteIds.length) return;
    const now = formatDateTime();
    const nowMs = Date.now();
    const modifiedIds: string[] = [];
    notes.value.forEach((note) => {
      if (noteIds.includes(note.id)) {
        note.isDeleted = true;
        note.deletedAt = now;
        note.updatedAt = now;
        note.updatedAtMs = nowMs;
        modifiedIds.push(note.id);
        closeTab(note.id);
      }
    });
    showToast(`已将 ${modifiedIds.length} 篇笔记移入回收站`);
    triggerAutoSyncDebounced({ noteIds: modifiedIds });
  }

  function batchRestoreFromTrash(noteIds: string[]) {
    if (!noteIds.length) return;
    const now = formatDateTime();
    const nowMs = Date.now();
    const modifiedIds: string[] = [];
    notes.value.forEach((note) => {
      if (noteIds.includes(note.id)) {
        note.isDeleted = false;
        note.deletedAt = undefined;
        note.updatedAt = now;
        note.updatedAtMs = nowMs;
        modifiedIds.push(note.id);
      }
    });
    showToast(`已成功还原 ${modifiedIds.length} 篇笔记`);
    triggerAutoSyncDebounced({ noteIds: modifiedIds });
  }

  async function batchPermanentlyDelete(noteIds: string[]) {
    if (!noteIds.length) return;
    const count = noteIds.length;
    notes.value = notes.value.filter((n) => !noteIds.includes(n.id));
    noteIds.forEach((id) => closeTab(id));
    showToast(`已彻底删除 ${count} 篇笔记`);
    triggerAutoSyncDebounced({ deletedNoteIds: noteIds });
  }

  async function batchExportNotes(notesToExport: Note[]) {
    if (!notesToExport.length) return;
    showToast(`正在导出 ${notesToExport.length} 篇笔记...`);
    for (const note of notesToExport) {
      await exportNoteAsMarkdown(note);
      await new Promise((r) => setTimeout(r, 200));
    }
    showToast(`成功导出 ${notesToExport.length} 篇文件`);
  }

  function duplicateNote(note: Note) {
    const now = formatDateTime();
    const nowMs = Date.now();
    const copy: Note = {
      ...note,
      id: 'note-' + nowMs,
      title: `${note.title} (副本)`,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
      shareUrl: undefined,
    };
    notes.value.unshift(copy);
    showToast('已创建笔记副本');
    triggerAutoSyncDebounced({ noteId: copy.id });
  }

  async function exportNoteAsMarkdown(note: Note) {
    if (note.format === 'mindmap' || note.type === 'mindmap') {
      try {
        const mindData = JSON.parse(note.content);
        await exportToXMind(mindData, note.title || '思维导图');
        showToast('XMind 文件已导出');
      } catch (e) {
        // Fallback: export as json/km
        const blob = new Blob([note.content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${note.title || '思维导图'}.km`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('思维导图文件已导出');
      }
    } else if (note.format === 'drawio' || note.type === 'drawio') {
      const blob = new Blob([note.content], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title || '图表'}.drawio`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Draw.io 图表文件已导出');
    } else {
      const blob = new Blob([note.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title || '未命名笔记'}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Markdown 文件已导出');
    }
  }

  function importMarkdownFile(filename: string, content: string, targetFolderId?: string) {
    const folder = resolveTargetFolderId(targetFolderId);
    const now = formatDateTime();
    const nowMs = Date.now();
    const title = filename.replace(/\.(md|txt|markdown)$/i, '') || '导入的笔记';
    const newNote: Note = {
      id: 'note-' + nowMs + Math.random().toString(36).substring(2, 5),
      title,
      content,
      folderId: folder,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
      isStarred: false,
      isDeleted: false,
      tags: ['导入'],
      format: 'markdown',
      type: 'markdown',
    };
    notes.value.unshift(newNote);
    triggerAutoSyncDebounced({ noteId: newNote.id });
  }

  function importMindMapFile(filename: string, content: string, targetFolderId?: string) {
    const folder = resolveTargetFolderId(targetFolderId);
    const now = formatDateTime();
    const nowMs = Date.now();
    const title = filename.replace(/\.(xmind|km|mm|json)$/i, '') || '导入的思维导图';

    let processedContent = content;
    // If raw XML from FreeMind (.mm)
    const trimmed = (content || '').trim();
    if (trimmed.startsWith('<') && (trimmed.includes('<map') || trimmed.includes('<node'))) {
      try {
        const parsed = parseFreeMindXml(trimmed);
        processedContent = JSON.stringify(parsed, null, 2);
      } catch (err) {
        console.warn('Failed to parse FreeMind XML, storing raw content', err);
      }
    }

    const newNote: Note = {
      id: 'note-' + nowMs + Math.random().toString(36).substring(2, 5),
      title,
      content: processedContent,
      folderId: folder,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
      isStarred: false,
      isDeleted: false,
      tags: ['思维导图', '导入'],
      format: 'mindmap',
      type: 'mindmap',
    };
    notes.value.unshift(newNote);
    triggerAutoSyncDebounced({ noteId: newNote.id });
    return newNote;
  }

  function importDrawioFile(filename: string, content: string, targetFolderId?: string) {
    const folder = resolveTargetFolderId(targetFolderId);
    const now = formatDateTime();
    const nowMs = Date.now();
    const title = filename.replace(/\.(drawio|xml|drawio\.xml|drawio\.svg|drawio\.png)$/i, '') || '导入的图表';
    const newNote: Note = {
      id: 'note-' + nowMs + Math.random().toString(36).substring(2, 5),
      title,
      content,
      folderId: folder,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
      isStarred: false,
      isDeleted: false,
      tags: ['Draw.io', '导入'],
      format: 'drawio',
      type: 'drawio',
    };
    notes.value.unshift(newNote);
    triggerAutoSyncDebounced({ noteId: newNote.id });
    return newNote;
  }

  function navigateToNoteFromSearch(item: SearchResultItem) {
    selectFolder(item.note.folderId);
    openNoteTab(item.note);
    searchQuery.value = '';
  }

  // ==================== Website Bookmarks & Categories CRUD ====================
  function stampBookmarkMutation(bm: Bookmark) {
    bm.updatedAt = formatDateTime();
    bm.updatedAtMs = Date.now();
  }

  function stampBookmarkCategoryMutation(cat: BookmarkCategory) {
    cat.updatedAt = formatDateTime();
    cat.updatedAtMs = Date.now();
  }

  function enrichBookmarkIconInBackground(bookmarkId: string, targetUrl: string, currentIconUrl?: string) {
    const defaultIcon = getDefaultFaviconUrl(targetUrl);
    // Skip background fetch if a specific non-default icon URL was already resolved
    if (currentIconUrl && currentIconUrl !== defaultIcon) return;

    fetchTargetSiteMetadata(targetUrl)
      .then((meta) => {
        if (!meta.iconUrl || meta.iconUrl === currentIconUrl) return;
        const target = bookmarks.value.find((b) => b.id === bookmarkId);
        if (!target || target.url !== targetUrl) return;
        target.iconUrl = meta.iconUrl;
        stampBookmarkMutation(target);
        triggerAutoSyncDebounced({ bookmarkId: target.id });
      })
      .catch(() => {
        // Ignore silent background enrichment errors
      });
  }

  function createBookmark(input: {
    title?: string;
    url: string;
    description?: string;
    categoryId?: string;
    tags?: string[];
    isPinned?: boolean;
    iconUrl?: string;
  }): { success: boolean; bookmark?: Bookmark; error?: string } {
    const normalized = normalizeBookmarkUrl(input.url);
    if (!normalized.valid) {
      showToast(normalized.error || '网址格式无效');
      return { success: false, error: normalized.error };
    }

    const now = formatDateTime();
    const nowMs = Date.now();
    const cleanTags = Array.from(
      new Set((input.tags || []).map((t) => t.trim()).filter(Boolean))
    );
    const validCatId =
      input.categoryId && bookmarkCategories.value.some((c) => c.id === input.categoryId)
        ? input.categoryId
        : '';
    const resolvedIcon = (input.iconUrl || '').trim() || getDefaultFaviconUrl(normalized.url) || undefined;

    const newBookmark: Bookmark = {
      id: 'bm-' + nowMs + '-' + Math.random().toString(36).substring(2, 6),
      title: (input.title || '').trim() || deriveTitleFromUrl(normalized.url),
      url: normalized.url,
      description: (input.description || '').trim(),
      categoryId: validCatId,
      tags: cleanTags,
      isPinned: Boolean(input.isPinned),
      iconUrl: resolvedIcon,
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
    };

    bookmarks.value.unshift(newBookmark);
    showToast(`书签「${newBookmark.title}」已添加`);
    triggerAutoSyncDebounced({ bookmarkId: newBookmark.id });
    enrichBookmarkIconInBackground(newBookmark.id, newBookmark.url, newBookmark.iconUrl);
    return { success: true, bookmark: newBookmark };
  }

  function updateBookmark(
    id: string,
    updates: Partial<Bookmark>
  ): { success: boolean; error?: string } {
    const bm = bookmarks.value.find((b) => b.id === id);
    if (!bm) return { success: false, error: '书签不存在' };

    let urlChanged = false;
    if (updates.url !== undefined) {
      const normalized = normalizeBookmarkUrl(updates.url);
      if (!normalized.valid) {
        showToast(normalized.error || '网址格式无效');
        return { success: false, error: normalized.error };
      }
      if (bm.url !== normalized.url) {
        urlChanged = true;
      }
      bm.url = normalized.url;
    }

    if (updates.title !== undefined) {
      bm.title = updates.title.trim() || deriveTitleFromUrl(bm.url);
    }
    if (updates.description !== undefined) {
      bm.description = updates.description.trim();
    }
    if (updates.categoryId !== undefined) {
      bm.categoryId =
        updates.categoryId && bookmarkCategories.value.some((c) => c.id === updates.categoryId)
          ? updates.categoryId
          : '';
    }
    if (updates.tags !== undefined) {
      bm.tags = Array.from(new Set(updates.tags.map((t) => t.trim()).filter(Boolean)));
    }
    if (updates.isPinned !== undefined) {
      bm.isPinned = Boolean(updates.isPinned);
    }
    if (updates.iconUrl !== undefined) {
      bm.iconUrl = updates.iconUrl.trim() || getDefaultFaviconUrl(bm.url) || undefined;
    } else if (urlChanged) {
      bm.iconUrl = getDefaultFaviconUrl(bm.url) || undefined;
    }

    stampBookmarkMutation(bm);
    showToast('书签已更新');
    triggerAutoSyncDebounced({ bookmarkId: bm.id });
    if (urlChanged || !bm.iconUrl) {
      enrichBookmarkIconInBackground(bm.id, bm.url, bm.iconUrl);
    }
    return { success: true };
  }

  function toggleBookmarkPin(id: string) {
    const bm = bookmarks.value.find((b) => b.id === id);
    if (!bm) return;
    bm.isPinned = !bm.isPinned;
    stampBookmarkMutation(bm);
    showToast(bm.isPinned ? `已置顶「${bm.title}」` : `已取消置顶「${bm.title}」`);
    triggerAutoSyncDebounced({ bookmarkId: bm.id });
  }

  // Direct permanent deletion for bookmarks (bypasses Trash; uses deletion tombstone for multi-window sync)
  function deleteBookmark(id: string) {
    const idx = bookmarks.value.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const title = bookmarks.value[idx].title;
    bookmarks.value = bookmarks.value.filter((b) => b.id !== id);
    showToast(`书签「${title}」已彻底删除`);
    triggerAutoSyncDebounced({ deletedBookmarkId: id });
  }

  function batchDeleteBookmarks(ids: string[]) {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const existingIds = bookmarks.value.filter((b) => idSet.has(b.id)).map((b) => b.id);
    if (!existingIds.length) return;
    bookmarks.value = bookmarks.value.filter((b) => !idSet.has(b.id));
    showToast(`已彻底删除 ${existingIds.length} 条书签`);
    triggerAutoSyncDebounced({ deletedBookmarkIds: existingIds });
  }

  function batchMoveBookmarks(ids: string[], targetCategoryId: string) {
    if (!ids.length) return;
    const validCatId =
      targetCategoryId && bookmarkCategories.value.some((c) => c.id === targetCategoryId)
        ? targetCategoryId
        : '';
    const now = formatDateTime();
    const nowMs = Date.now();
    const modifiedIds: string[] = [];
    const idSet = new Set(ids);
    bookmarks.value.forEach((bm) => {
      if (idSet.has(bm.id)) {
        bm.categoryId = validCatId;
        bm.updatedAt = now;
        bm.updatedAtMs = nowMs;
        modifiedIds.push(bm.id);
      }
    });
    if (modifiedIds.length) {
      showToast(`已将 ${modifiedIds.length} 条书签移至「${getBookmarkCategoryName(validCatId)}」`);
      triggerAutoSyncDebounced({ bookmarkIds: modifiedIds });
    }
  }

  function batchToggleBookmarkPin(ids: string[], forcePinned?: boolean) {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const targets = bookmarks.value.filter((b) => idSet.has(b.id));
    if (!targets.length) return;
    const nextPinned = forcePinned !== undefined ? forcePinned : targets.some((b) => !b.isPinned);
    const now = formatDateTime();
    const nowMs = Date.now();
    const modifiedIds: string[] = [];
    targets.forEach((bm) => {
      bm.isPinned = nextPinned;
      bm.updatedAt = now;
      bm.updatedAtMs = nowMs;
      modifiedIds.push(bm.id);
    });
    showToast(nextPinned ? `已置顶 ${targets.length} 条书签` : `已取消 ${targets.length} 条书签的置顶`);
    triggerAutoSyncDebounced({ bookmarkIds: modifiedIds });
  }

  function getAllDescendantBookmarkCategoryIds(categoryId: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>([categoryId]);
    const queue: string[] = [categoryId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const c of bookmarkCategories.value) {
        if (c.parentId === current && !visited.has(c.id)) {
          visited.add(c.id);
          result.push(c.id);
          queue.push(c.id);
        }
      }
    }
    return result;
  }

  function moveBookmarkToCategory(bookmarkId: string, targetCategoryId: string) {
    const bm = bookmarks.value.find((b) => b.id === bookmarkId);
    if (!bm) return;
    const validCatId =
      targetCategoryId && bookmarkCategories.value.some((c) => c.id === targetCategoryId)
        ? targetCategoryId
        : '';
    if (bm.categoryId === validCatId) return;
    bm.categoryId = validCatId;
    stampBookmarkMutation(bm);
    showToast(`已将「${bm.title}」移至「${validCatId ? getBookmarkCategoryName(validCatId) : '根目录'}」`);
    triggerAutoSyncDebounced({ bookmarkId: bm.id });
  }

  function toggleBookmarkCategoryCollapse(id: string) {
    const cat = bookmarkCategories.value.find((c) => c.id === id);
    if (!cat) return;
    cat.isOpen = cat.isOpen === false ? true : false;
  }

  function createBookmarkCategory(
    name: string,
    color?: string | null,
    parentId?: string | null
  ): BookmarkCategory | null {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const now = formatDateTime();
    const nowMs = Date.now();
    const validParentId =
      parentId && bookmarkCategories.value.some((c) => c.id === parentId) ? parentId : null;
    const siblings = bookmarkCategories.value.filter((c) => (c.parentId || null) === validParentId);
    const maxOrder = siblings.reduce((m, c) => Math.max(m, c.order || 0), 0);
    const newCat: BookmarkCategory = {
      id: 'bm-cat-' + nowMs + '-' + Math.random().toString(36).substring(2, 5),
      name: trimmed,
      parentId: validParentId,
      isOpen: true,
      order: maxOrder + 1,
      color: color || '#2563eb',
      createdAt: now,
      updatedAt: now,
      updatedAtMs: nowMs,
    };
    const nextList = [...bookmarkCategories.value];
    if (validParentId) {
      const parent = nextList.find((c) => c.id === validParentId);
      if (parent) parent.isOpen = true;
    }
    bookmarkCategories.value = normalizeBookmarkCategoryOrders([...nextList, newCat]);
    showToast(`书签目录「${trimmed}」已创建`);
    triggerAutoSyncDebounced({ bookmarkCategoryId: newCat.id });
    return newCat;
  }

  function updateBookmarkCategory(
    id: string,
    updates: { name?: string; color?: string | null; parentId?: string | null }
  ) {
    const cat = bookmarkCategories.value.find((c) => c.id === id);
    if (!cat) return;
    if (updates.name !== undefined && updates.name.trim()) {
      cat.name = updates.name.trim();
    }
    if (updates.color !== undefined) {
      cat.color = updates.color;
    }
    if (updates.parentId !== undefined) {
      const descendants = new Set([id, ...getAllDescendantBookmarkCategoryIds(id)]);
      const nextParent =
        updates.parentId && !descendants.has(updates.parentId) && bookmarkCategories.value.some((c) => c.id === updates.parentId)
          ? updates.parentId
          : null;
      cat.parentId = nextParent;
    }
    stampBookmarkCategoryMutation(cat);
    bookmarkCategories.value = normalizeBookmarkCategoryOrders(bookmarkCategories.value);
    showToast('书签目录已更新');
    triggerAutoSyncDebounced({ bookmarkCategoryId: cat.id });
  }

  function reorderBookmarkCategory(id: string, direction: 'up' | 'down') {
    const target = bookmarkCategories.value.find((c) => c.id === id);
    if (!target) return;
    const parentKey = target.parentId || null;
    const siblings = bookmarkCategories.value
      .filter((c) => (c.parentId || null) === parentKey)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = siblings.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;

    const [moved] = siblings.splice(idx, 1);
    siblings.splice(targetIdx, 0, moved);

    const now = formatDateTime();
    const nowMs = Date.now();
    const orderMap = new Map<string, number>();
    siblings.forEach((c, i) => orderMap.set(c.id, i + 1));

    const updated = bookmarkCategories.value.map((c) => {
      if (orderMap.has(c.id)) {
        return {
          ...c,
          order: orderMap.get(c.id)!,
          updatedAt: now,
          updatedAtMs: nowMs,
        };
      }
      return c;
    });
    bookmarkCategories.value = normalizeBookmarkCategoryOrders(updated);
    triggerAutoSyncDebounced({ bookmarkCategoryIds: siblings.map((c) => c.id) });
  }

  function deleteBookmarkCategory(id: string) {
    const cat = bookmarkCategories.value.find((c) => c.id === id);
    if (!cat) return;

    const descendantIds = getAllDescendantBookmarkCategoryIds(id);
    const idsToDelete = new Set<string>([id, ...descendantIds]);
    const fallbackCategoryId = cat.parentId && !idsToDelete.has(cat.parentId) ? cat.parentId : '';

    const now = formatDateTime();
    const nowMs = Date.now();
    const affectedBookmarkIds: string[] = [];
    bookmarks.value.forEach((bm) => {
      if (idsToDelete.has(bm.categoryId)) {
        bm.categoryId = fallbackCategoryId;
        bm.updatedAt = now;
        bm.updatedAtMs = nowMs;
        affectedBookmarkIds.push(bm.id);
      }
    });

    const remaining = normalizeBookmarkCategoryOrders(
      bookmarkCategories.value.filter((c) => !idsToDelete.has(c.id))
    );
    bookmarkCategories.value = remaining;

    const targetLabel = fallbackCategoryId ? getBookmarkCategoryName(fallbackCategoryId) : '根目录';
    showToast(
      affectedBookmarkIds.length > 0
        ? `目录「${cat.name}」已删除，${affectedBookmarkIds.length} 条书签已移至「${targetLabel}」`
        : `目录「${cat.name}」已删除`
    );
    triggerAutoSyncDebounced({
      deletedBookmarkCategoryIds: Array.from(idsToDelete),
      bookmarkIds: affectedBookmarkIds,
    });
  }

  // Cloud API Actions
  function openCloudSyncModal() {
    isCloudSyncModalOpen.value = true;
  }

  async function testCloudConnection(customConfig?: CloudConfig) {
    const config = customConfig || cloudConfig.value;
    return await testCloudApi(config);
  }

  async function checkCloudDiff(customConfig?: CloudConfig): Promise<{ success: boolean; message: string; diff?: SyncDiffResult }> {
    const config = customConfig || cloudConfig.value;
    if (!config.apiUrl) {
      return { success: false, message: '请先填写云端 API 地址' };
    }

    const res = await fetchRemoteData(config);
    if (!res.success || !res.data) {
      return { success: false, message: res.message || '获取云端数据失败' };
    }

    const diff = calculateSyncDiff(
      notes.value,
      folders.value,
      res.data.notes,
      res.data.folders,
      res.data.deletedNotes,
      res.data.deletedFolders,
      {
        localBookmarks: bookmarks.value,
        localBookmarkCategories: bookmarkCategories.value,
        remoteBookmarks: res.data.bookmarks,
        remoteBookmarkCategories: res.data.bookmarkCategories,
        remoteDeletedBookmarks: res.data.deletedBookmarks,
        remoteDeletedBookmarkCategories: res.data.deletedBookmarkCategories,
      }
    );
    syncDiff.value = diff;
    return { success: true, message: '差异检测完成', diff };
  }

  async function performCloudSync(
    mode: 'merge' | 'pull_all' = 'merge',
    customConfig?: CloudConfig,
    silent = false
  ) {
    const config = customConfig || cloudConfig.value;
    if (!config.apiUrl) {
      if (!silent) showToast('未配置云端 API 地址');
      return { success: false, message: '未配置云端 API 地址' };
    }

    if (isSyncing.value) {
      return { success: false, message: '已有同步任务正在进行中' };
    }

    if (autoSyncDebounceTimer) {
      clearTimeout(autoSyncDebounceTimer);
      autoSyncDebounceTimer = null;
    }

    isSyncing.value = true;
    syncStatus.value = 'syncing';

    try {
      const syncStartSeq = globalDirtySeq;
      const modifiedNotesSnapshot = Array.from(pendingModifiedNoteIds);
      const modifiedFoldersSnapshot = Array.from(pendingModifiedFolderIds);
      const modifiedBookmarksSnapshot = Array.from(pendingModifiedBookmarkIds);
      const modifiedBookmarkCategoriesSnapshot = Array.from(pendingModifiedBookmarkCategoryIds);
      const deletedNotesToSync = Array.from(pendingDeletedNoteIds);
      const deletedFoldersToSync = Array.from(pendingDeletedFolderIds);
      const deletedBookmarksToSync = Array.from(pendingDeletedBookmarkIds);
      const deletedBookmarkCategoriesToSync = Array.from(pendingDeletedBookmarkCategoryIds);

      const noteSeqSnapshot = new Map<string, number>();
      modifiedNotesSnapshot.forEach((id) => noteSeqSnapshot.set(id, noteDirtySeq.get(id) || 0));
      const folderSeqSnapshot = new Map<string, number>();
      modifiedFoldersSnapshot.forEach((id) => folderSeqSnapshot.set(id, folderDirtySeq.get(id) || 0));
      const bookmarkSeqSnapshot = new Map<string, number>();
      modifiedBookmarksSnapshot.forEach((id) => bookmarkSeqSnapshot.set(id, bookmarkDirtySeq.get(id) || 0));
      const bookmarkCategorySeqSnapshot = new Map<string, number>();
      modifiedBookmarkCategoriesSnapshot.forEach((id) =>
        bookmarkCategorySeqSnapshot.set(id, bookmarkCategoryDirtySeq.get(id) || 0)
      );

      const res = await pushSyncToCloud(config, notes.value, folders.value, mode, {
        deletedNoteIds: deletedNotesToSync,
        deletedFolderIds: deletedFoldersToSync,
        frequentFolderIds: frequentFolderIds.value,
        bookmarks: bookmarks.value,
        bookmarkCategories: bookmarkCategories.value,
        deletedBookmarkIds: deletedBookmarksToSync,
        deletedBookmarkCategoryIds: deletedBookmarkCategoriesToSync,
      });

      if (res.success) {
        isApplyingRemoteSync.value = true;

        if (mode === 'pull_all') {
          pendingModifiedNoteIds.clear();
          pendingModifiedFolderIds.clear();
          pendingModifiedBookmarkIds.clear();
          pendingModifiedBookmarkCategoryIds.clear();
          pendingDeletedNoteIds.clear();
          pendingDeletedFolderIds.clear();
          pendingDeletedBookmarkIds.clear();
          pendingDeletedBookmarkCategoryIds.clear();
          persistPendingDeletions();

          if (res.mergedNotes) {
            notes.value = res.mergedNotes;
          }
          if (res.mergedFolders) {
            folders.value = normalizeFolderOrders(res.mergedFolders);
          }
          if (res.mergedBookmarkCategories) {
            bookmarkCategories.value = normalizeBookmarkCategoryOrders(res.mergedBookmarkCategories);
          }
          if (res.mergedBookmarks) {
            bookmarks.value = res.mergedBookmarks;
          }
        } else {
          // Clear only items synced up to syncStartSeq; preserve any edits made while sync was in flight
          modifiedNotesSnapshot.forEach((id) => {
            if ((noteDirtySeq.get(id) || 0) <= (noteSeqSnapshot.get(id) || 0)) {
              pendingModifiedNoteIds.delete(id);
            }
          });
          modifiedFoldersSnapshot.forEach((id) => {
            if ((folderDirtySeq.get(id) || 0) <= (folderSeqSnapshot.get(id) || 0)) {
              pendingModifiedFolderIds.delete(id);
            }
          });
          modifiedBookmarksSnapshot.forEach((id) => {
            if ((bookmarkDirtySeq.get(id) || 0) <= (bookmarkSeqSnapshot.get(id) || 0)) {
              pendingModifiedBookmarkIds.delete(id);
            }
          });
          modifiedBookmarkCategoriesSnapshot.forEach((id) => {
            if ((bookmarkCategoryDirtySeq.get(id) || 0) <= (bookmarkCategorySeqSnapshot.get(id) || 0)) {
              pendingModifiedBookmarkCategoryIds.delete(id);
            }
          });
          deletedNotesToSync.forEach((id) => pendingDeletedNoteIds.delete(id));
          deletedFoldersToSync.forEach((id) => pendingDeletedFolderIds.delete(id));
          deletedBookmarksToSync.forEach((id) => pendingDeletedBookmarkIds.delete(id));
          deletedBookmarkCategoriesToSync.forEach((id) => pendingDeletedBookmarkCategoryIds.delete(id));
          persistPendingDeletions();

          if (res.mergedNotes) {
            const deletedSet = new Set(pendingDeletedNoteIds);
            const inFlightModifiedNotes = new Map<string, Note>();
            notes.value.forEach((localN) => {
              const dirtySeq = noteDirtySeq.get(localN.id) || 0;
              const deletedSeq = noteDeletedSeq.get(localN.id) || 0;
              if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
                inFlightModifiedNotes.set(localN.id, localN);
              }
            });
            const mergedIds = new Set<string>();
            const nextNotes = res.mergedNotes
              .filter((n) => {
                if (deletedSet.has(n.id)) return false;
                if ((noteDeletedSeq.get(n.id) || 0) > syncStartSeq) return false;
                if (n.isDeleted && res.deletedNotes?.[n.id]) return false;
                return true;
              })
              .map((n) => {
                mergedIds.add(n.id);
                return inFlightModifiedNotes.get(n.id) || n;
              });
            inFlightModifiedNotes.forEach((localN, id) => {
              if (!mergedIds.has(id) && !deletedSet.has(id) && (noteDeletedSeq.get(id) || 0) <= syncStartSeq) {
                nextNotes.unshift(localN);
              }
            });
            notes.value = nextNotes;
          }

          if (res.mergedFolders) {
            const deletedFSet = new Set(pendingDeletedFolderIds);
            const inFlightModifiedFolders = new Map<string, Folder>();
            folders.value.forEach((localF) => {
              const dirtySeq = folderDirtySeq.get(localF.id) || 0;
              const deletedSeq = folderDeletedSeq.get(localF.id) || 0;
              if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
                inFlightModifiedFolders.set(localF.id, localF);
              }
            });
            const mergedFIds = new Set<string>();
            const nextFolders = res.mergedFolders
              .filter((f) => !deletedFSet.has(f.id) && (folderDeletedSeq.get(f.id) || 0) <= syncStartSeq)
              .map((f) => {
                mergedFIds.add(f.id);
                return inFlightModifiedFolders.get(f.id) || f;
              });
            inFlightModifiedFolders.forEach((localF, id) => {
              if (!mergedFIds.has(id) && !deletedFSet.has(id) && (folderDeletedSeq.get(id) || 0) <= syncStartSeq) {
                nextFolders.push(localF);
              }
            });
            folders.value = normalizeFolderOrders(nextFolders);
          }

          if (res.mergedBookmarkCategories) {
            const deletedCatSet = new Set(pendingDeletedBookmarkCategoryIds);
            const inFlightCats = new Map<string, BookmarkCategory>();
            bookmarkCategories.value.forEach((localC) => {
              const dirtySeq = bookmarkCategoryDirtySeq.get(localC.id) || 0;
              const deletedSeq = bookmarkCategoryDeletedSeq.get(localC.id) || 0;
              if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
                inFlightCats.set(localC.id, localC);
              }
            });
            const mergedCatIds = new Set<string>();
            const nextCats = res.mergedBookmarkCategories
              .filter((c) => !deletedCatSet.has(c.id) && (bookmarkCategoryDeletedSeq.get(c.id) || 0) <= syncStartSeq)
              .map((c) => {
                mergedCatIds.add(c.id);
                return inFlightCats.get(c.id) || c;
              });
            inFlightCats.forEach((localC, id) => {
              if (!mergedCatIds.has(id) && !deletedCatSet.has(id) && (bookmarkCategoryDeletedSeq.get(id) || 0) <= syncStartSeq) {
                nextCats.push(localC);
              }
            });
            bookmarkCategories.value = normalizeBookmarkCategoryOrders(nextCats);
          }

          if (res.mergedBookmarks) {
            const deletedBmSet = new Set(pendingDeletedBookmarkIds);
            const inFlightBms = new Map<string, Bookmark>();
            bookmarks.value.forEach((localB) => {
              const dirtySeq = bookmarkDirtySeq.get(localB.id) || 0;
              const deletedSeq = bookmarkDeletedSeq.get(localB.id) || 0;
              if (dirtySeq > syncStartSeq && dirtySeq > deletedSeq) {
                inFlightBms.set(localB.id, localB);
              }
            });
            const mergedBmIds = new Set<string>();
            const nextBms = res.mergedBookmarks
              .filter((b) => !deletedBmSet.has(b.id) && (bookmarkDeletedSeq.get(b.id) || 0) <= syncStartSeq)
              .map((b) => {
                mergedBmIds.add(b.id);
                return inFlightBms.get(b.id) || b;
              });
            inFlightBms.forEach((localB, id) => {
              if (!mergedBmIds.has(id) && !deletedBmSet.has(id) && (bookmarkDeletedSeq.get(id) || 0) <= syncStartSeq) {
                nextBms.unshift(localB);
              }
            });
            bookmarks.value = nextBms;
          }
        }

        if (res.mergedFrequentFolderIds && Array.isArray(res.mergedFrequentFolderIds)) {
          frequentFolderIds.value = res.mergedFrequentFolderIds;
        }

        // If current activeFolderId is not found in folders, fallback to first available folder or root
        if (activeFolderId.value && !folders.value.some((f) => f.id === activeFolderId.value)) {
          activeFolderId.value = firstRootFolderId.value || (folders.value[0]?.id ?? '');
        }

        cloudConfig.value.enabled = true;
        cloudConfig.value.lastSyncedAt = res.serverTime || Date.now();
        lastVisibilitySyncAt = Date.now();
        syncDiff.value = {
          localOnlyNotes: 0,
          localUpdatedNotes: 0,
          cloudOnlyNotes: 0,
          cloudUpdatedNotes: 0,
          localOnlyFolders: 0,
          cloudOnlyFolders: 0,
          localUpdatedFolders: 0,
          cloudUpdatedFolders: 0,
          localOnlyBookmarks: 0,
          localUpdatedBookmarks: 0,
          cloudOnlyBookmarks: 0,
          cloudUpdatedBookmarks: 0,
          localOnlyBookmarkCategories: 0,
          localUpdatedBookmarkCategories: 0,
          cloudOnlyBookmarkCategories: 0,
          cloudUpdatedBookmarkCategories: 0,
          totalDiff: 0,
        };
        await nextTick();
        isApplyingRemoteSync.value = false;

        if (hasAnyPendingSyncItems()) {
          hasQueuedChangesDuringSync = true;
          syncStatus.value = 'unsynced';
        } else {
          syncStatus.value = 'synced';
        }
        if (!silent) showToast(res.message || '数据已成功同步至云端');
        return { success: true, message: res.message };
      } else {
        syncStatus.value = 'error';
        if (!silent) showToast(res.message || '云端同步失败');
        return { success: false, message: res.message };
      }
    } catch (err: any) {
      syncStatus.value = 'error';
      if (!silent) showToast(`同步异常: ${err.message}`);
      return { success: false, message: err.message };
    } finally {
      isSyncing.value = false;
      isApplyingRemoteSync.value = false;
      if (hasQueuedChangesDuringSync && isAutoSyncActive()) {
        hasQueuedChangesDuringSync = false;
        triggerAutoSyncDebounced();
      } else {
        hasQueuedChangesDuringSync = false;
      }
    }
  }

  function saveCloudConfig(newConfig: Partial<CloudConfig>) {
    if (newConfig.apiUrl && newConfig.apiUrl !== cloudConfig.value.apiUrl) {
      clearApiEndpointCache(cloudConfig.value.apiUrl);
      clearApiEndpointCache(newConfig.apiUrl);
    }
    cloudConfig.value = {
      ...cloudConfig.value,
      ...newConfig,
    };
    if (isCloudConfigured()) {
      syncStatus.value = cloudConfig.value.lastSyncedAt && !hasAnyPendingSyncItems() ? 'synced' : 'unsynced';
    } else {
      syncStatus.value = 'unconfigured';
    }
  }

  function clearCloudConfig() {
    clearApiEndpointCache();
    cloudConfig.value = {
      enabled: false,
      apiUrl: '',
      apiToken: '',
      userId: '',
      autoSync: true,
      lastSyncedAt: null,
    };
    syncStatus.value = 'unconfigured';
    syncDiff.value = null;
    showToast('已断开云端连接，当前处于纯本地存储模式');
  }

  return {
    folders,
    notes,
    bookmarks,
    bookmarkCategories,
    bookmarksCount,
    currentView,
    activeFolderId,
    activeFolder,
    activeNoteId,
    activeNote,
    openTabIds,
    activeTabId,
    openTabNotes,
    activeTabNote,
    searchQuery,
    editorMode,
    sortField,
    sortOrder,
    filterOptions,
    selectedNoteIds,
    displayedNotes,
    breadcrumbItems,
    globalSearchResults,
    isImportModalOpen,
    isNewFolderModalOpen,
    targetParentFolderForNew,
    isMoveModalOpen,
    noteToMove,
    notesToMove,
    isRenameNoteModalOpen,
    noteToRename,
    toastMessage,
    // Cloud Sync State & Operations
    cloudConfig,
    isCloudSyncModalOpen,
    syncStatus,
    syncDiff,
    isSyncing,
    openCloudSyncModal,
    testCloudConnection,
    checkCloudDiff,
    performCloudSync,
    saveCloudConfig,
    clearCloudConfig,
    // helpers & counts
    rootFolders,
    firstRootFolderId,
    frequentFolders,
    frequentFolderIds,
    isFolderFrequent,
    toggleFrequentFolder,
    addFrequentFolder,
    removeFrequentFolder,
    reorderFrequentFolders,
    setFrequentFolderIds,
    getFolderFullPath,
    getFolderAncestors,
    getSubFolders,
    getAllDescendantFolderIds,
    getFolderNoteCount,
    getDirectFolderNoteCount,
    starredNotesCount,
    deletedNotesCount,
    getBookmarkCategoryName,
    // methods
    showToast,
    selectFolder,
    selectView,
    handleBreadcrumbClick,
    createNewNote,
    createNewMindMap,
    createNewDrawioDiagram,
    openNoteInNewTab,
    openNoteTab,
    switchTab,
    closeTab,
    closeOtherTabs,
    closeRightTabs,
    closeAllTabs,
    reorderTabs,
    updateNote,
    toggleStar,
    moveToTrash,
    restoreFromTrash,
    permanentlyDeleteNote,
    emptyTrash,
    createFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
    toggleFolderCollapse,
    openMoveModal,
    openBatchMoveModal,
    moveNoteToFolder,
    batchMoveNotesToFolder,
    batchToggleStar,
    batchMoveToTrash,
    batchRestoreFromTrash,
    batchPermanentlyDelete,
    batchExportNotes,
    duplicateNote,
    exportNoteAsMarkdown,
    importMarkdownFile,
    importMindMapFile,
    importDrawioFile,
    navigateToNoteFromSearch,
    // Bookmarks & Categories CRUD
    createBookmark,
    updateBookmark,
    toggleBookmarkPin,
    deleteBookmark,
    moveBookmarkToCategory,
    batchDeleteBookmarks,
    batchMoveBookmarks,
    batchToggleBookmarkPin,
    getAllDescendantBookmarkCategoryIds,
    toggleBookmarkCategoryCollapse,
    createBookmarkCategory,
    updateBookmarkCategory,
    reorderBookmarkCategory,
    deleteBookmarkCategory,
    // IndexedDB storage info
    isStorageReady,
    storageInfo,
    updateStorageEstimate,
  };
}
