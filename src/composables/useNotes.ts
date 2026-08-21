import { ref, computed, watch, onMounted, nextTick } from 'vue';
import {
  Folder,
  Note,
  ViewType,
  SortField,
  SortOrder,
  FilterOptions,
  BreadcrumbItem,
  SearchResultItem,
  CloudConfig,
  SyncStatus,
  SyncDiffResult,
} from '../types';
import { INITIAL_FOLDERS, INITIAL_NOTES } from '../data/initialData';
import { exportToXMind } from '../utils/xmind';
import { compareFolders, normalizeFolderOrders, reorderFolder } from '../utils/folderSort';
import {
  initStorageAndMigrate,
  saveNotesToIDB,
  saveFoldersToIDB,
  saveCloudConfigToIDB,
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
  saveSingleFolderToCloud,
  saveFoldersToCloud,
  deleteSingleFolderFromCloud,
  clearApiEndpointCache,
} from '../utils/cloudApi';

const STORAGE_KEY_NOTES = 'fengye_cloud_notes_data_v2';
const STORAGE_KEY_FOLDERS = 'fengye_cloud_folders_data_v2';
const STORAGE_KEY_CLOUD_CONFIG = 'fengye_cloud_sync_config_v2';
const STORAGE_KEY_FREQUENT_FOLDERS = 'fengye_cloud_frequent_folders_v2';

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

  // Frequent / Pinned Folders
  const frequentFolderIds = ref<string[]>(
    loadStoredData(STORAGE_KEY_FREQUENT_FOLDERS, [])
  );

  watch(
    frequentFolderIds,
    (newIds) => {
      try {
        localStorage.setItem(STORAGE_KEY_FREQUENT_FOLDERS, JSON.stringify(newIds));
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
  const syncStatus = ref<SyncStatus>(cloudConfig.value.enabled && cloudConfig.value.apiUrl ? 'synced' : 'unconfigured');
  const syncDiff = ref<SyncDiffResult | null>(null);
  const isSyncing = ref<boolean>(false);
  const isApplyingRemoteSync = ref<boolean>(false);
  let autoSyncDebounceTimer: any = null;

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

  // Asynchronous IndexedDB initialization & migration on startup
  onMounted(async () => {
    try {
      isApplyingRemoteSync.value = true;
      const { notes: idbNotes, folders: idbFolders, cloudConfig: idbConfig } = await initStorageAndMigrate();
      if (Array.isArray(idbNotes)) notes.value = idbNotes;
      if (Array.isArray(idbFolders)) {
        folders.value = normalizeFolderOrders(idbFolders);
      }
      if (idbConfig) cloudConfig.value = idbConfig;
      isStorageReady.value = true;
      await updateStorageEstimate();
      await nextTick();
      isApplyingRemoteSync.value = false;

      // Check URL parameters for noteId to directly open in standalone/new-tab view
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetNoteId = urlParams.get('noteId') || urlParams.get('note') || (window.location.hash.startsWith('#note-') ? window.location.hash.substring(1) : null);
        if (targetNoteId) {
          const matched = notes.value.find((n) => n.id === targetNoteId);
          if (matched && !matched.isDeleted) {
            activeNoteId.value = matched.id;
            activeFolderId.value = matched.folderId;
            isEditorOpen.value = true;
            editorMode.value = 'split';
          }
        }
      } catch (err) {
        console.warn('Failed to parse noteId from URL:', err);
      }

      // Automatically sync latest notes and folders from cloud on initial startup if enabled
      if (cloudConfig.value.enabled && cloudConfig.value.apiUrl) {
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
          if (Array.isArray(parsed) && parsed.length > 0) {
            isApplyingRemoteSync.value = true;
            notes.value = parsed;
            await nextTick();
            isApplyingRemoteSync.value = false;
          }
        } catch {}
      } else if (e.key === STORAGE_KEY_FOLDERS && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            isApplyingRemoteSync.value = true;
            folders.value = normalizeFolderOrders(parsed);
            await nextTick();
            isApplyingRemoteSync.value = false;
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
  });

  // Current active view and selection
  const currentView = ref<ViewType>('folder');
  const activeFolderId = ref<string>(folders.value[0]?.id || '');
  const searchQuery = ref<string>('');

  // Active note for editor / viewer modal
  const activeNoteId = ref<string | null>(null);
  const isEditorOpen = ref<boolean>(false);
  const editorMode = ref<'split' | 'edit' | 'preview'>('split');

  // Sort & Filter
  const sortField = ref<SortField>('createdAt');
  const sortOrder = ref<SortOrder>('desc');
  const filterOptions = ref<FilterOptions>({
    starredOnly: false,
    favoriteOnly: false,
    format: 'all',
  });

  // Selected note IDs for batch operations
  const selectedNoteIds = ref<string[]>([]);

  // Modals state
  const isImportModalOpen = ref<boolean>(false);
  const isNewFolderModalOpen = ref<boolean>(false);
  const targetParentFolderForNew = ref<Folder | null>(null);
  const isShareModalOpen = ref<boolean>(false);
  const sharingNote = ref<Note | null>(null);
  const isMoveModalOpen = ref<boolean>(false);
  const noteToMove = ref<Note | null>(null);
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

  // Queue of modified entity IDs for incremental sync
  const pendingModifiedNoteIds = new Set<string>();
  const pendingModifiedFolderIds = new Set<string>();
  const pendingDeletedNoteIds = new Set<string>();
  const pendingDeletedFolderIds = new Set<string>();

  // Trigger Debounced Sync when changes happen in Cloud Mode
  function triggerAutoSyncDebounced(options?: {
    noteId?: string;
    folderId?: string;
    folderIds?: string[];
    deletedNoteId?: string;
    deletedFolderId?: string;
  }) {
    if (options?.noteId) pendingModifiedNoteIds.add(options.noteId);
    if (options?.folderId) pendingModifiedFolderIds.add(options.folderId);
    if (options?.folderIds && Array.isArray(options.folderIds)) {
      options.folderIds.forEach((id) => pendingModifiedFolderIds.add(id));
    }
    if (options?.deletedNoteId) pendingDeletedNoteIds.add(options.deletedNoteId);
    if (options?.deletedFolderId) pendingDeletedFolderIds.add(options.deletedFolderId);

    if (isSyncing.value || isApplyingRemoteSync.value) {
      return;
    }

    if (!cloudConfig.value.enabled || !cloudConfig.value.apiUrl || !cloudConfig.value.autoSync) {
      if (!cloudConfig.value.enabled) {
        syncStatus.value = 'unconfigured';
      }
      return;
    }

    syncStatus.value = 'unsynced';
    if (autoSyncDebounceTimer) clearTimeout(autoSyncDebounceTimer);

    autoSyncDebounceTimer = setTimeout(async () => {
      if (!cloudConfig.value.enabled || !cloudConfig.value.apiUrl) return;
      if (isSyncing.value || isApplyingRemoteSync.value) return;

      try {
        isSyncing.value = true;
        syncStatus.value = 'syncing';

        // 1. If only a few notes/folders were modified, do lightweight incremental sync!
        const totalPending =
          pendingModifiedNoteIds.size +
          pendingModifiedFolderIds.size +
          pendingDeletedNoteIds.size +
          pendingDeletedFolderIds.size;

        if (totalPending > 0 && totalPending <= 15) {
          let allOk = true;

          // Sync modified notes individually
          for (const nid of Array.from(pendingModifiedNoteIds)) {
            const note = notes.value.find((n) => n.id === nid);
            if (note) {
              const res = await saveSingleNoteToCloud(cloudConfig.value, note);
              if (!res.success) allOk = false;
            }
          }

          // Sync deleted notes
          for (const nid of Array.from(pendingDeletedNoteIds)) {
            const res = await deleteSingleNoteFromCloud(cloudConfig.value, nid);
            if (!res.success) allOk = false;
          }

          // Sync modified folders in batch (preserving all updated orders and parentIds)
          if (pendingModifiedFolderIds.size > 0) {
            const modifiedFolders = folders.value.filter((f) => pendingModifiedFolderIds.has(f.id));
            if (modifiedFolders.length > 0) {
              const res = await saveFoldersToCloud(cloudConfig.value, modifiedFolders);
              if (!res.success) allOk = false;
            }
          }

          // Sync deleted folders
          for (const fid of Array.from(pendingDeletedFolderIds)) {
            const res = await deleteSingleFolderFromCloud(cloudConfig.value, fid);
            if (!res.success) allOk = false;
          }

          pendingModifiedNoteIds.clear();
          pendingModifiedFolderIds.clear();
          pendingDeletedNoteIds.clear();
          pendingDeletedFolderIds.clear();

          if (allOk) {
            cloudConfig.value.lastSyncedAt = Date.now();
            syncStatus.value = 'synced';
            return;
          }
        }

        // 2. Fallback: Full two-way smart merge
        const deletedNotesToSync = Array.from(pendingDeletedNoteIds);
        const deletedFoldersToSync = Array.from(pendingDeletedFolderIds);

        pendingModifiedNoteIds.clear();
        pendingModifiedFolderIds.clear();
        pendingDeletedNoteIds.clear();
        pendingDeletedFolderIds.clear();

        const res = await pushSyncToCloud(cloudConfig.value, notes.value, folders.value, 'merge', {
          deletedNoteIds: deletedNotesToSync,
          deletedFolderIds: deletedFoldersToSync,
        });
        if (res.success) {
          isApplyingRemoteSync.value = true;
          if (res.mergedNotes) {
            const deletedSet = new Set(deletedNotesToSync);
            notes.value = res.mergedNotes.filter((n) => !deletedSet.has(n.id));
          }
          if (res.mergedFolders) {
            const deletedFSet = new Set(deletedFoldersToSync);
            folders.value = normalizeFolderOrders(res.mergedFolders.filter((f) => !deletedFSet.has(f.id)));
          }
          cloudConfig.value.lastSyncedAt = res.serverTime || Date.now();
          await nextTick();
          isApplyingRemoteSync.value = false;
          syncStatus.value = 'synced';
        } else {
          syncStatus.value = 'error';
        }
      } catch (e) {
        syncStatus.value = 'error';
      } finally {
        isSyncing.value = false;
        isApplyingRemoteSync.value = false;
      }
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
  const sharedNotesCount = computed(() => notes.value.filter((n) => n.isShared && !n.isDeleted).length);
  const starredNotesCount = computed(() => notes.value.filter((n) => n.isStarred && !n.isDeleted).length);
  const favoriteNotesCount = computed(() => notes.value.filter((n) => n.isFavorite && !n.isDeleted).length);
  const deletedNotesCount = computed(() => notes.value.filter((n) => n.isDeleted).length);

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

  function toggleFrequentFolder(folderId: string) {
    const idx = frequentFolderIds.value.indexOf(folderId);
    const targetFolder = folders.value.find((f) => f.id === folderId);
    if (idx !== -1) {
      frequentFolderIds.value.splice(idx, 1);
      showToast(`已从常用目录移除 "${targetFolder?.name || '文件夹'}"`);
    } else {
      frequentFolderIds.value.push(folderId);
      showToast(`已将 "${targetFolder?.name || '文件夹'}" 添加至常用目录`);
    }
  }

  function addFrequentFolder(folderId: string) {
    if (!frequentFolderIds.value.includes(folderId)) {
      frequentFolderIds.value.push(folderId);
      const targetFolder = folders.value.find((f) => f.id === folderId);
      showToast(`已将 "${targetFolder?.name || '文件夹'}" 添加至常用目录`);
    }
  }

  function removeFrequentFolder(folderId: string) {
    const idx = frequentFolderIds.value.indexOf(folderId);
    if (idx !== -1) {
      frequentFolderIds.value.splice(idx, 1);
      const targetFolder = folders.value.find((f) => f.id === folderId);
      showToast(`已从常用目录移除 "${targetFolder?.name || '文件夹'}"`);
    }
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

    if (currentView.value === 'shared') {
      return [
        { id: 'root', label: '我的笔记', view: 'folder', folderId: defaultRootFolderId, clickable: true },
        { id: 'shared', label: '我的分享', view: 'shared', clickable: false },
      ];
    }
    if (currentView.value === 'starred') {
      return [
        { id: 'root', label: '我的笔记', view: 'folder', folderId: defaultRootFolderId, clickable: true },
        { id: 'starred', label: '我的标星', view: 'starred', clickable: false },
      ];
    }
    if (currentView.value === 'favorite') {
      return [
        { id: 'root', label: '我的笔记', view: 'folder', folderId: defaultRootFolderId, clickable: true },
        { id: 'favorite', label: '我的收藏', view: 'favorite', clickable: false },
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
      } else if (currentView.value === 'shared') {
        result = result.filter((n) => n.isShared);
      } else if (currentView.value === 'starred') {
        result = result.filter((n) => n.isStarred);
      } else if (currentView.value === 'favorite') {
        result = result.filter((n) => n.isFavorite);
      }
    }

    // Search filtering
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Secondary filters
    if (filterOptions.value.starredOnly) {
      result = result.filter((n) => n.isStarred);
    }
    if (filterOptions.value.favoriteOnly) {
      result = result.filter((n) => n.isFavorite);
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

  // Global Search grouped with priority for current folder & path display
  const globalSearchResults = computed<{
    currentFolderMatches: SearchResultItem[];
    otherMatches: SearchResultItem[];
    totalCount: number;
  }>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) {
      return { currentFolderMatches: [], otherMatches: [], totalCount: 0 };
    }

    const availableNotes = notes.value.filter((n) => !n.isDeleted);
    const currentMatches: SearchResultItem[] = [];
    const otherMatches: SearchResultItem[] = [];

    availableNotes.forEach((note) => {
      const titleLower = note.title.toLowerCase();
      const contentLower = note.content.toLowerCase();
      const tagMatch = note.tags.some((t) => t.toLowerCase().includes(q));

      if (titleLower.includes(q) || contentLower.includes(q) || tagMatch) {
        // Build content snippet
        let snippet = '';
        const idx = contentLower.indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 25);
          const end = Math.min(note.content.length, idx + q.length + 35);
          snippet = (start > 0 ? '...' : '') + note.content.substring(start, end).replace(/\n/g, ' ') + (end < note.content.length ? '...' : '');
        } else {
          snippet = note.content.slice(0, 50).replace(/\n/g, ' ') + '...';
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

    return {
      currentFolderMatches: currentMatches,
      otherMatches: otherMatches,
      totalCount: currentMatches.length + otherMatches.length,
    };
  });

  // Actions
  function selectFolder(folderId: string) {
    currentView.value = 'folder';
    activeFolderId.value = folderId;
    searchQuery.value = '';
    selectedNoteIds.value = [];
  }

  function selectView(view: ViewType) {
    currentView.value = view;
    searchQuery.value = '';
    selectedNoteIds.value = [];
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
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    const defaultFolder: Folder = {
      id: 'folder-' + Date.now(),
      name: '我的笔记',
      parentId: null,
      order: 1,
      isOpen: true,
    };
    folders.value.push(defaultFolder);
    activeFolderId.value = defaultFolder.id;
    triggerAutoSyncDebounced({ folderId: defaultFolder.id });
    return defaultFolder.id;
  }

  function createNewNote(title = '无标题笔记', folderId?: string) {
    const targetFolder = resolveTargetFolderId(folderId);
    const now = formatDateTime();
    const newNote: Note = {
      id: 'note-' + Date.now(),
      title: title,
      content: `# ${title}\n\n在这里开始编写你的笔记内容...\n`,
      folderId: targetFolder,
      createdAt: now,
      updatedAt: now,
      isStarred: false,
      isFavorite: false,
      isShared: false,
      isDeleted: false,
      tags: [],
      format: 'markdown',
    };

    notes.value.unshift(newNote);
    activeNoteId.value = newNote.id;
    isEditorOpen.value = true;
    editorMode.value = 'split';
    showToast('新建笔记成功');
    triggerAutoSyncDebounced({ noteId: newNote.id });
    return newNote;
  }

  function createNewMindMap(title = '无标题思维导图', folderId?: string) {
    const targetFolder = resolveTargetFolderId(folderId);
    const now = formatDateTime();
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
      id: 'note-' + Date.now(),
      title: title,
      content: JSON.stringify(defaultMindMapJson, null, 2),
      folderId: targetFolder,
      createdAt: now,
      updatedAt: now,
      isStarred: false,
      isFavorite: false,
      isShared: false,
      isDeleted: false,
      tags: ['思维导图'],
      format: 'mindmap',
      type: 'mindmap',
    };

    notes.value.unshift(newNote);
    activeNoteId.value = newNote.id;
    isEditorOpen.value = true;
    showToast('新建思维导图成功');
    triggerAutoSyncDebounced({ noteId: newNote.id });
    return newNote;
  }

  function getNoteShareUrl(noteId: string): string {
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

    const targetUrl = getNoteShareUrl(note.id);
    const newWindow = window.open(targetUrl, '_blank');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      // If popup is blocked by browser, fallback to in-app editor and notify user
      openNoteEditor(note, 'split');
      showToast('浏览器已拦截弹窗，已在当前页面打开');
    }
  }

  function openNoteEditor(note: Note, mode: 'split' | 'edit' | 'preview' = 'split') {
    activeNoteId.value = note.id;
    editorMode.value = mode;
    isEditorOpen.value = true;
  }

  function closeEditor() {
    isEditorOpen.value = false;
  }

  function updateNote(id: string, updates: Partial<Note>) {
    const idx = notes.value.findIndex((n) => n.id === id);
    if (idx !== -1) {
      notes.value[idx] = {
        ...notes.value[idx],
        ...updates,
        updatedAt: formatDateTime(),
      };
      triggerAutoSyncDebounced({ noteId: id });
    }
  }

  function toggleStar(noteId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.isStarred = !note.isStarred;
      showToast(note.isStarred ? '已添加标星' : '已取消标星');
      triggerAutoSyncDebounced({ noteId });
    }
  }

  function toggleFavorite(noteId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.isFavorite = !note.isFavorite;
      showToast(note.isFavorite ? '已加入收藏' : '已移出收藏');
      triggerAutoSyncDebounced({ noteId });
    }
  }

  function moveToTrash(noteId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.isDeleted = true;
      note.deletedAt = formatDateTime();
      if (activeNoteId.value === noteId) {
        isEditorOpen.value = false;
      }
      showToast('已移入回收站');
      triggerAutoSyncDebounced({ noteId });
    }
  }

  function restoreFromTrash(noteId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.isDeleted = false;
      note.deletedAt = undefined;
      showToast('已成功还原笔记');
      triggerAutoSyncDebounced({ noteId });
    }
  }

  async function permanentlyDeleteNote(noteId: string) {
    notes.value = notes.value.filter((n) => n.id !== noteId);
    pendingDeletedNoteIds.add(noteId);
    showToast('笔记已彻底删除');

    if (cloudConfig.value.enabled && cloudConfig.value.apiUrl) {
      deleteSingleNoteFromCloud(cloudConfig.value, noteId).catch(() => {});
    }
    triggerAutoSyncDebounced({ deletedNoteId: noteId });
  }

  async function emptyTrash() {
    const trashNotes = notes.value.filter((n) => n.isDeleted);
    const trashIds = trashNotes.map((n) => n.id);
    if (trashIds.length === 0) {
      showToast('回收站为空');
      return;
    }

    // 1. Remove from local memory & IDB
    notes.value = notes.value.filter((n) => !n.isDeleted);
    trashIds.forEach((id) => pendingDeletedNoteIds.add(id));

    // 2. If cloud is enabled, sync the permanent deletion immediately
    if (cloudConfig.value.enabled && cloudConfig.value.apiUrl) {
      syncStatus.value = 'syncing';
      try {
        const res = await emptyTrashOnCloud(cloudConfig.value, trashIds);
        if (res.success) {
          trashIds.forEach((id) => pendingDeletedNoteIds.delete(id));
          syncStatus.value = 'synced';
          cloudConfig.value.lastSyncedAt = Date.now();
          showToast('回收站已清空，云端数据已同步彻底删除');
        } else {
          triggerAutoSyncDebounced();
          showToast('本地回收站已清空，正在同步至云端...');
        }
      } catch (err) {
        triggerAutoSyncDebounced();
        showToast('本地回收站已清空，后台将自动同步至云端');
      }
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

    const newFolder: Folder = {
      id: 'folder-' + Date.now(),
      name: name.trim(),
      parentId: targetParentId,
      order: maxOrder + 1,
      isOpen: true,
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
      .map((f) => f.id);
    affectedSiblings.forEach((id) => pendingModifiedFolderIds.add(id));

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

    // Move all notes inside these folders to trash
    notes.value.forEach((n) => {
      if (allFolderIds.includes(n.folderId)) {
        n.isDeleted = true;
      }
    });

    folders.value = folders.value.filter((f) => !allFolderIds.includes(f.id));
    normalizeFolderOrders(folders.value);
    frequentFolderIds.value = frequentFolderIds.value.filter((id) => !allFolderIds.includes(id));
    if (allFolderIds.includes(activeFolderId.value)) {
      activeFolderId.value = folders.value[0]?.id || '';
    }

    // Mark remaining siblings in this group as modified to update continuous orders
    const remainingSiblings = folders.value
      .filter((f) => (f.parentId || null) === parentId)
      .map((f) => f.id);
    remainingSiblings.forEach((id) => pendingModifiedFolderIds.add(id));

    // Save to IDB & LocalStorage immediately
    saveFoldersToIDB(folders.value).catch(console.error);
    try {
      localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders.value));
    } catch {}

    showToast(`文件夹 "${folder.name}" 及其子内容已删除`);
    triggerAutoSyncDebounced({ deletedFolderId: folderId, folderIds: remainingSiblings });
  }

  function renameFolder(folderId: string, newName: string) {
    const folder = folders.value.find((f) => f.id === folderId);
    if (folder && newName.trim()) {
      folder.name = newName.trim();
      normalizeFolderOrders(folders.value);
      pendingModifiedFolderIds.add(folderId);

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

    // Collect all affected sibling folders whose order or parentId changed
    const affectedFolderIds = result.affectedFolderIds || [draggedFolderId];
    affectedFolderIds.forEach((id) => pendingModifiedFolderIds.add(id));

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

  function openShareModal(note: Note) {
    sharingNote.value = note;
    if (!note.shareUrl) {
      note.shareUrl = `https://maple-note.cloud/s/${Math.random().toString(36).substring(2, 10)}`;
      note.isShared = true;
    }
    isShareModalOpen.value = true;
  }

  function openMoveModal(note: Note) {
    noteToMove.value = note;
    isMoveModalOpen.value = true;
  }

  function moveNoteToFolder(noteId: string, targetFolderId: string) {
    const note = notes.value.find((n) => n.id === noteId);
    if (note) {
      note.folderId = targetFolderId;
      isMoveModalOpen.value = false;
      const targetF = folders.value.find((f) => f.id === targetFolderId);
      showToast(`已将笔记移动到 "${targetF?.name || '文件夹'}"`);
    }
  }

  function duplicateNote(note: Note) {
    const now = formatDateTime();
    const copy: Note = {
      ...note,
      id: 'note-' + Date.now(),
      title: `${note.title} (副本)`,
      createdAt: now,
      updatedAt: now,
      isShared: false,
      shareUrl: undefined,
    };
    notes.value.unshift(copy);
    showToast('已创建笔记副本');
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
    const title = filename.replace(/\.(md|txt|markdown)$/i, '') || '导入的笔记';
    const newNote: Note = {
      id: 'note-' + Date.now() + Math.random().toString(36).substring(2, 5),
      title,
      content,
      folderId: folder,
      createdAt: now,
      updatedAt: now,
      isStarred: false,
      isFavorite: false,
      isShared: false,
      isDeleted: false,
      tags: ['导入'],
      format: 'markdown',
      type: 'markdown',
    };
    notes.value.unshift(newNote);
  }

  function importMindMapFile(filename: string, content: string, targetFolderId?: string) {
    const folder = resolveTargetFolderId(targetFolderId);
    const now = formatDateTime();
    const title = filename.replace(/\.(xmind|km|json)$/i, '') || '导入的思维导图';
    const newNote: Note = {
      id: 'note-' + Date.now() + Math.random().toString(36).substring(2, 5),
      title,
      content,
      folderId: folder,
      createdAt: now,
      updatedAt: now,
      isStarred: false,
      isFavorite: false,
      isShared: false,
      isDeleted: false,
      tags: ['思维导图', '导入'],
      format: 'mindmap',
      type: 'mindmap',
    };
    notes.value.unshift(newNote);
    return newNote;
  }

  function navigateToNoteFromSearch(item: SearchResultItem) {
    selectFolder(item.note.folderId);
    openNoteInNewTab(item.note);
    searchQuery.value = '';
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

    const diff = calculateSyncDiff(notes.value, folders.value, res.data.notes, res.data.folders);
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

    isSyncing.value = true;
    syncStatus.value = 'syncing';

    try {
      const deletedNotesToSync = Array.from(pendingDeletedNoteIds);
      const deletedFoldersToSync = Array.from(pendingDeletedFolderIds);

      const res = await pushSyncToCloud(config, notes.value, folders.value, mode, {
        deletedNoteIds: deletedNotesToSync,
        deletedFolderIds: deletedFoldersToSync,
      });
      if (res.success) {
        isApplyingRemoteSync.value = true;
        if (res.mergedNotes) {
          const deletedSet = new Set(deletedNotesToSync);
          notes.value = res.mergedNotes.filter((n) => !deletedSet.has(n.id));
        }
        if (res.mergedFolders) {
          const deletedFSet = new Set(deletedFoldersToSync);
          folders.value = normalizeFolderOrders(res.mergedFolders.filter((f) => !deletedFSet.has(f.id)));
        }

        // If current activeFolderId is not found in folders, fallback to first available folder or root
        if (activeFolderId.value && !folders.value.some((f) => f.id === activeFolderId.value)) {
          activeFolderId.value = firstRootFolderId.value || (folders.value[0]?.id ?? '');
        }

        cloudConfig.value.enabled = true;
        cloudConfig.value.lastSyncedAt = res.serverTime || Date.now();
        pendingModifiedNoteIds.clear();
        pendingModifiedFolderIds.clear();
        pendingDeletedNoteIds.clear();
        pendingDeletedFolderIds.clear();
        syncDiff.value = {
          localOnlyNotes: 0,
          localUpdatedNotes: 0,
          cloudOnlyNotes: 0,
          cloudUpdatedNotes: 0,
          localOnlyFolders: 0,
          cloudOnlyFolders: 0,
          totalDiff: 0,
        };
        await nextTick();
        isApplyingRemoteSync.value = false;
        syncStatus.value = 'synced';
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
    }
  }

  function saveCloudConfig(newConfig: Partial<CloudConfig>) {
    if (newConfig.apiUrl && newConfig.apiUrl !== cloudConfig.value.apiUrl) {
      clearApiEndpointCache();
    }
    cloudConfig.value = {
      ...cloudConfig.value,
      ...newConfig,
    };
    if (cloudConfig.value.enabled && cloudConfig.value.apiUrl) {
      syncStatus.value = 'synced';
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
    currentView,
    activeFolderId,
    activeFolder,
    activeNoteId,
    activeNote,
    searchQuery,
    isEditorOpen,
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
    isShareModalOpen,
    sharingNote,
    isMoveModalOpen,
    noteToMove,
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
    getFolderFullPath,
    getFolderAncestors,
    getSubFolders,
    getAllDescendantFolderIds,
    getFolderNoteCount,
    getDirectFolderNoteCount,
    sharedNotesCount,
    starredNotesCount,
    favoriteNotesCount,
    deletedNotesCount,
    // methods
    showToast,
    selectFolder,
    selectView,
    handleBreadcrumbClick,
    createNewNote,
    createNewMindMap,
    openNoteEditor,
    openNoteInNewTab,
    getNoteShareUrl,
    closeEditor,
    updateNote,
    toggleStar,
    toggleFavorite,
    moveToTrash,
    restoreFromTrash,
    permanentlyDeleteNote,
    emptyTrash,
    createFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
    toggleFolderCollapse,
    openShareModal,
    openMoveModal,
    moveNoteToFolder,
    duplicateNote,
    exportNoteAsMarkdown,
    importMarkdownFile,
    importMindMapFile,
    navigateToNoteFromSearch,
    // IndexedDB storage info
    isStorageReady,
    storageInfo,
    updateStorageEstimate,
  };
}
