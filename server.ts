import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  INITIAL_FOLDERS,
  INITIAL_NOTES,
  INITIAL_BOOKMARKS,
  INITIAL_BOOKMARK_CATEGORIES,
} from './src/data/initialData';
import { Bookmark, BookmarkCategory, Folder, Note } from './src/types';

const app = express();
const PORT = 3000;

// Path to durable storage file
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cloud_sync_db.json');

// Interface for server-side stored user database
interface UserDataStore {
  notes: Note[];
  folders: Folder[];
  frequentFolderIds?: string[];
  bookmarks?: Bookmark[];
  bookmarkCategories?: BookmarkCategory[];
  deletedNotes?: Record<string, number>;
  deletedFolders?: Record<string, number>;
  deletedBookmarks?: Record<string, number>;
  deletedBookmarkCategories?: Record<string, number>;
  updatedAt: number;
}

interface ServerDatabase {
  users: Record<string, UserDataStore>;
}

// In-memory cache with persistent file backup
let dbCache: ServerDatabase = { users: {} };

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadDatabase(): ServerDatabase {
  try {
    ensureDataDir();
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(raw);
    } else {
      // Initialize with default_user seeded with initial data
      dbCache = {
        users: {
          default_user: {
            notes: JSON.parse(JSON.stringify(INITIAL_NOTES)),
            folders: JSON.parse(JSON.stringify(INITIAL_FOLDERS)),
            frequentFolderIds: [],
            bookmarks: JSON.parse(JSON.stringify(INITIAL_BOOKMARKS)),
            bookmarkCategories: JSON.parse(JSON.stringify(INITIAL_BOOKMARK_CATEGORIES)),
            deletedNotes: {},
            deletedFolders: {},
            deletedBookmarks: {},
            deletedBookmarkCategories: {},
            updatedAt: Date.now(),
          },
        },
      };
      saveDatabase();
    }
  } catch (err) {
    console.error('[Cloud DB] Error loading database:', err);
  }
  return dbCache;
}

function saveDatabase(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Cloud DB] Error saving database:', err);
  }
}

// Helper to get or initialize user store
function getUserStore(userId = 'default_user'): UserDataStore {
  const normalizedId = (userId || 'default_user').trim() || 'default_user';
  if (!dbCache.users[normalizedId]) {
    dbCache.users[normalizedId] = {
      notes: JSON.parse(JSON.stringify(INITIAL_NOTES)),
      folders: JSON.parse(JSON.stringify(INITIAL_FOLDERS)),
      frequentFolderIds: [],
      bookmarks: JSON.parse(JSON.stringify(INITIAL_BOOKMARKS)),
      bookmarkCategories: JSON.parse(JSON.stringify(INITIAL_BOOKMARK_CATEGORIES)),
      deletedNotes: {},
      deletedFolders: {},
      deletedBookmarks: {},
      deletedBookmarkCategories: {},
      updatedAt: Date.now(),
    };
    saveDatabase();
  }
  if (!Array.isArray(dbCache.users[normalizedId].frequentFolderIds)) {
    dbCache.users[normalizedId].frequentFolderIds = [];
  }
  if (!Array.isArray(dbCache.users[normalizedId].bookmarks)) {
    dbCache.users[normalizedId].bookmarks = JSON.parse(JSON.stringify(INITIAL_BOOKMARKS));
  }
  if (!Array.isArray(dbCache.users[normalizedId].bookmarkCategories)) {
    dbCache.users[normalizedId].bookmarkCategories = JSON.parse(JSON.stringify(INITIAL_BOOKMARK_CATEGORIES));
  }
  if (!dbCache.users[normalizedId].deletedNotes || typeof dbCache.users[normalizedId].deletedNotes !== 'object') {
    dbCache.users[normalizedId].deletedNotes = {};
  }
  if (!dbCache.users[normalizedId].deletedFolders || typeof dbCache.users[normalizedId].deletedFolders !== 'object') {
    dbCache.users[normalizedId].deletedFolders = {};
  }
  if (!dbCache.users[normalizedId].deletedBookmarks || typeof dbCache.users[normalizedId].deletedBookmarks !== 'object') {
    dbCache.users[normalizedId].deletedBookmarks = {};
  }
  if (
    !dbCache.users[normalizedId].deletedBookmarkCategories ||
    typeof dbCache.users[normalizedId].deletedBookmarkCategories !== 'object'
  ) {
    dbCache.users[normalizedId].deletedBookmarkCategories = {};
  }
  return dbCache.users[normalizedId];
}

// Helper to extract user ID from headers/query/body
function extractUserId(req: express.Request): string {
  const headerUserId = req.headers['x-user-id'] as string;
  const queryUserId = req.query.userId as string;
  const bodyUserId = req.body?.userId as string;
  return (headerUserId || queryUserId || bodyUserId || 'default_user').trim() || 'default_user';
}

function parseSafeTime(timeStr?: string | number | null): number {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') return timeStr;
  const str = String(timeStr).trim();
  const normalized = str.includes('T') ? str : str.replace(' ', 'T');
  const parsed = new Date(normalized).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;
  const fallback = new Date(str).getTime();
  return isNaN(fallback) ? 0 : fallback;
}

function getEntityTimestampMs(entity?: { updatedAtMs?: number; updatedAt?: string; createdAt?: string }): number {
  if (!entity) return 0;
  if (typeof entity.updatedAtMs === 'number' && !isNaN(entity.updatedAtMs) && entity.updatedAtMs > 0) {
    return entity.updatedAtMs;
  }
  return parseSafeTime(entity.updatedAt || entity.createdAt);
}

function formatServerDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function collectDescendantFolderIds(folders: Folder[], rootId: string): Set<string> {
  const result = new Set<string>([String(rootId)]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      const fid = String(f.id);
      const pid = f.parentId ? String(f.parentId) : null;
      if (pid && result.has(pid) && !result.has(fid)) {
        result.add(fid);
        added = true;
      }
    }
  }
  return result;
}

const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const TOMBSTONE_MAX_ENTRIES = 5000;

function pruneTombstoneMap(map: Record<string, number>, now = Date.now()): void {
  const cutoff = now - TOMBSTONE_MAX_AGE_MS;
  const entries = Object.entries(map).filter(([, ts]) => typeof ts === 'number' && ts >= cutoff);
  if (entries.length > TOMBSTONE_MAX_ENTRIES) {
    entries.sort((a, b) => b[1] - a[1]);
    entries.length = TOMBSTONE_MAX_ENTRIES;
  }
  for (const key of Object.keys(map)) {
    delete map[key];
  }
  for (const [k, v] of entries) {
    map[k] = v;
  }
}

function recordTombstones(map: Record<string, number>, ids: Iterable<string>, tsMs: number): void {
  for (const rawId of ids) {
    const id = String(rawId || '').trim();
    if (!id) continue;
    map[id] = Math.max(map[id] || 0, tsMs);
  }
  pruneTombstoneMap(map, tsMs);
}

function isBlockedByNoteTombstone(clientNote: Note, tombstoneMs?: number): boolean {
  if (!tombstoneMs) return false;
  // Trash notes on another client must never resurrect a permanently deleted note
  if (clientNote.isDeleted) return true;
  const clientTime = getEntityTimestampMs(clientNote);
  return clientTime === 0 || clientTime <= tombstoneMs;
}

function isBlockedByFolderTombstone(clientFolder: Folder, tombstoneMs?: number): boolean {
  if (!tombstoneMs) return false;
  const clientTime = getEntityTimestampMs(clientFolder);
  return clientTime === 0 || clientTime <= tombstoneMs;
}

// Parse body & set standard CORS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-User-Id, X-Api-Key');
  res.header('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Optional API Token enforcement when CLOUD_API_TOKEN / API_TOKEN is configured in env
app.use(['/api', '/api.php'], (req, res, next) => {
  const expectedToken = (process.env.CLOUD_API_TOKEN || process.env.API_TOKEN || '').trim();
  if (!expectedToken) {
    return next();
  }
  const headerKey = (req.headers['x-api-key'] as string) || '';
  const authHeader = (req.headers['authorization'] as string) || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const clientToken = (bearerMatch ? bearerMatch[1] : headerKey).trim();

  if (!clientToken || clientToken !== expectedToken) {
    return res.status(401).json({
      code: 401,
      success: false,
      message: '认证失败：API Token 无效或未授权',
    });
  }
  next();
});

// Load DB on boot
loadDatabase();

// ==========================================
// 1. Health / Ping Check
// ==========================================
function handlePing(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  return res.json({
    code: 200,
    success: true,
    message: '枫叶云笔记服务端连接正常，同步通道畅通',
    data: {
      service: 'fengye-cloud-notes-fullstack-service',
      version: '2.1.0',
      status: 'ready',
      userId,
      noteCount: userStore.notes.length,
      folderCount: userStore.folders.length,
      frequentFoldersCount: (userStore.frequentFolderIds || []).length,
      bookmarksCount: (userStore.bookmarks || []).length,
      bookmarkCategoriesCount: (userStore.bookmarkCategories || []).length,
      serverTime: Date.now(),
      supportedFeatures: [
        'incremental_note_sync',
        'incremental_folder_sync',
        'frequent_folders_sync',
        'bookmarks_sync',
        'batch_merge_sync',
        'indexeddb_sync'
      ],
    },
    serverTime: Date.now(),
  });
}

app.get('/api/ping', handlePing);
app.get('/api/health', handlePing);
app.post('/api/ping', handlePing);

// ==========================================
// 2. Fetch All Remote Cloud Data
// ==========================================
function handleGetAllData(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  return res.json({
    code: 200,
    success: true,
    message: '全量云端数据获取成功',
    data: {
      notes: userStore.notes,
      folders: userStore.folders,
      frequentFolderIds: userStore.frequentFolderIds || [],
      bookmarks: userStore.bookmarks || [],
      bookmarkCategories: userStore.bookmarkCategories || [],
      deletedNotes: userStore.deletedNotes || {},
      deletedFolders: userStore.deletedFolders || {},
      deletedBookmarks: userStore.deletedBookmarks || {},
      deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
      notesCount: userStore.notes.length,
      foldersCount: userStore.folders.length,
      frequentFoldersCount: (userStore.frequentFolderIds || []).length,
      bookmarksCount: (userStore.bookmarks || []).length,
      bookmarkCategoriesCount: (userStore.bookmarkCategories || []).length,
      serverTime: Date.now(),
    },
    notes: userStore.notes,
    folders: userStore.folders,
    frequentFolderIds: userStore.frequentFolderIds || [],
    bookmarks: userStore.bookmarks || [],
    bookmarkCategories: userStore.bookmarkCategories || [],
    deletedNotes: userStore.deletedNotes || {},
    deletedFolders: userStore.deletedFolders || {},
    deletedBookmarks: userStore.deletedBookmarks || {},
    deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
    serverTime: Date.now(),
  });
}

app.get('/api/data', handleGetAllData);
app.post('/api/data', handleGetAllData);

// ==========================================
// 3. Batch Sync (Merge, Push All, Pull All)
// ==========================================
function handleSync(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const body = req.body || {};
  const mode = body.mode || body.action || req.query.action || 'merge';

  const clientNotes: Note[] = Array.isArray(body.notes) ? body.notes : [];
  const clientFolders: Folder[] = Array.isArray(body.folders) ? body.folders : [];
  const clientFrequentFolderIds: string[] = Array.isArray(body.frequentFolderIds)
    ? body.frequentFolderIds
    : Array.isArray(body.frequentFolders)
    ? body.frequentFolders
    : [];
  const hasClientBookmarks = Array.isArray(body.bookmarks);
  const hasClientBookmarkCategories = Array.isArray(body.bookmarkCategories);
  const clientBookmarks: Bookmark[] = hasClientBookmarks ? body.bookmarks : [];
  const clientBookmarkCategories: BookmarkCategory[] = hasClientBookmarkCategories
    ? body.bookmarkCategories
    : [];

  const now = Date.now();

  // Mode: push_all (Overwrite cloud with client data)
  if (mode === 'push_all') {
    const clientNoteIdSet = new Set(clientNotes.map((n) => String(n.id)));
    const clientFolderIdSet = new Set(clientFolders.map((f) => String(f.id)));
    const removedNoteIds = userStore.notes
      .map((n) => String(n.id))
      .filter((id) => !clientNoteIdSet.has(id));
    const removedFolderIds = userStore.folders
      .map((f) => String(f.id))
      .filter((id) => !clientFolderIdSet.has(id));

    recordTombstones(userStore.deletedNotes!, removedNoteIds, now);
    recordTombstones(userStore.deletedFolders!, removedFolderIds, now);
    clientNoteIdSet.forEach((id) => delete userStore.deletedNotes![id]);
    clientFolderIdSet.forEach((id) => delete userStore.deletedFolders![id]);

    userStore.notes = clientNotes;
    userStore.folders = clientFolders;
    if (Array.isArray(body.frequentFolderIds) || Array.isArray(body.frequentFolders)) {
      userStore.frequentFolderIds = clientFrequentFolderIds;
    }
    if (hasClientBookmarks) {
      const clientBmIdSet = new Set(clientBookmarks.map((b) => String(b.id)));
      const removedBmIds = (userStore.bookmarks || [])
        .map((b) => String(b.id))
        .filter((id) => !clientBmIdSet.has(id));
      recordTombstones(userStore.deletedBookmarks!, removedBmIds, now);
      clientBmIdSet.forEach((id) => delete userStore.deletedBookmarks![id]);
      userStore.bookmarks = clientBookmarks;
    }
    if (hasClientBookmarkCategories) {
      const clientCatIdSet = new Set(clientBookmarkCategories.map((c) => String(c.id)));
      const removedCatIds = (userStore.bookmarkCategories || [])
        .map((c) => String(c.id))
        .filter((id) => !clientCatIdSet.has(id));
      recordTombstones(userStore.deletedBookmarkCategories!, removedCatIds, now);
      clientCatIdSet.forEach((id) => delete userStore.deletedBookmarkCategories![id]);
      userStore.bookmarkCategories = clientBookmarkCategories;
    }
    userStore.updatedAt = now;
    saveDatabase();

    return res.json({
      code: 200,
      success: true,
      message: '本地数据已完全强制覆盖上传至云端服务器！',
      data: {
        notes: userStore.notes,
        folders: userStore.folders,
        frequentFolderIds: userStore.frequentFolderIds || [],
        bookmarks: userStore.bookmarks || [],
        bookmarkCategories: userStore.bookmarkCategories || [],
        deletedNotes: userStore.deletedNotes || {},
        deletedFolders: userStore.deletedFolders || {},
        deletedBookmarks: userStore.deletedBookmarks || {},
        deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
        serverTime: now,
      },
      notes: userStore.notes,
      folders: userStore.folders,
      frequentFolderIds: userStore.frequentFolderIds || [],
      bookmarks: userStore.bookmarks || [],
      bookmarkCategories: userStore.bookmarkCategories || [],
      deletedNotes: userStore.deletedNotes || {},
      deletedFolders: userStore.deletedFolders || {},
      deletedBookmarks: userStore.deletedBookmarks || {},
      deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
      serverTime: now,
    });
  }

  // Mode: pull_all (Overwrite client with cloud data)
  if (mode === 'pull_all') {
    return res.json({
      code: 200,
      success: true,
      message: '已成功从云端拉取全量最新数据，已覆盖本地！',
      data: {
        notes: userStore.notes,
        folders: userStore.folders,
        frequentFolderIds: userStore.frequentFolderIds || [],
        bookmarks: userStore.bookmarks || [],
        bookmarkCategories: userStore.bookmarkCategories || [],
        deletedNotes: userStore.deletedNotes || {},
        deletedFolders: userStore.deletedFolders || {},
        deletedBookmarks: userStore.deletedBookmarks || {},
        deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
        serverTime: now,
      },
      notes: userStore.notes,
      folders: userStore.folders,
      frequentFolderIds: userStore.frequentFolderIds || [],
      bookmarks: userStore.bookmarks || [],
      bookmarkCategories: userStore.bookmarkCategories || [],
      deletedNotes: userStore.deletedNotes || {},
      deletedFolders: userStore.deletedFolders || {},
      deletedBookmarks: userStore.deletedBookmarks || {},
      deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
      serverTime: now,
    });
  }

  // Mode: merge (Two-way smart merge based on timestamp + explicit deletions + tombstones)
  const opTs = Math.max(now, Number(body.timestamp) || 0);
  const deletedNoteIdSet = new Set<string>(
    Array.isArray(body.deletedNoteIds) ? body.deletedNoteIds.map(String) : []
  );
  const deletedFolderIdSet = new Set<string>(
    Array.isArray(body.deletedFolderIds) ? body.deletedFolderIds.map(String) : []
  );
  const deletedBookmarkIdSet = new Set<string>(
    Array.isArray(body.deletedBookmarkIds) ? body.deletedBookmarkIds.map(String) : []
  );
  const deletedBookmarkCategoryIdSet = new Set<string>(
    Array.isArray(body.deletedBookmarkCategoryIds) ? body.deletedBookmarkCategoryIds.map(String) : []
  );

  // Expand deletedFolderIdSet with any server-side descendants of deleted folders
  if (deletedFolderIdSet.size > 0) {
    for (const rootDelId of Array.from(deletedFolderIdSet)) {
      const descendants = collectDescendantFolderIds(userStore.folders, rootDelId);
      descendants.forEach((dId) => deletedFolderIdSet.add(dId));
    }
    userStore.folders = userStore.folders.filter((f) => !deletedFolderIdSet.has(String(f.id)));
    recordTombstones(userStore.deletedFolders!, deletedFolderIdSet, opTs);
  }

  if (deletedNoteIdSet.size > 0) {
    userStore.notes = userStore.notes.filter((n) => !deletedNoteIdSet.has(String(n.id)));
    recordTombstones(userStore.deletedNotes!, deletedNoteIdSet, opTs);
  }

  if (deletedBookmarkIdSet.size > 0) {
    userStore.bookmarks = (userStore.bookmarks || []).filter(
      (b) => !deletedBookmarkIdSet.has(String(b.id))
    );
    recordTombstones(userStore.deletedBookmarks!, deletedBookmarkIdSet, opTs);
  }

  if (deletedBookmarkCategoryIdSet.size > 0) {
    userStore.bookmarkCategories = (userStore.bookmarkCategories || []).filter(
      (c) => !deletedBookmarkCategoryIdSet.has(String(c.id))
    );
    recordTombstones(userStore.deletedBookmarkCategories!, deletedBookmarkCategoryIdSet, opTs);
    const nowStr = formatServerDateTime();
    (userStore.bookmarks || []).forEach((b) => {
      if (deletedBookmarkCategoryIdSet.has(String(b.categoryId))) {
        b.categoryId = '';
        b.updatedAt = nowStr;
        b.updatedAtMs = opTs;
      }
    });
  }

  const serverNoteMap = new Map<string, Note>(userStore.notes.map((n) => [String(n.id), n]));
  const serverFolderMap = new Map<string, Folder>(userStore.folders.map((f) => [String(f.id), f]));

  const mergedNotesMap = new Map<string, Note>();
  const mergedFoldersMap = new Map<string, Folder>();

  // 1. Process client notes vs server notes (respecting tombstones)
  for (const clientNote of clientNotes) {
    const id = String(clientNote.id);
    if (deletedNoteIdSet.has(id)) continue;
    const serverNote = serverNoteMap.get(id);

    if (!serverNote) {
      if (isBlockedByNoteTombstone(clientNote, userStore.deletedNotes?.[id])) {
        continue;
      }
      delete userStore.deletedNotes![id];
      mergedNotesMap.set(id, clientNote);
    } else {
      const clientTime = getEntityTimestampMs(clientNote);
      const serverTime = getEntityTimestampMs(serverNote);

      if (clientTime >= serverTime) {
        mergedNotesMap.set(id, clientNote);
      } else {
        mergedNotesMap.set(id, serverNote);
      }
    }
  }

  for (const serverNote of userStore.notes) {
    const id = String(serverNote.id);
    if (deletedNoteIdSet.has(id)) continue;
    if (!mergedNotesMap.has(id)) {
      mergedNotesMap.set(id, serverNote);
    }
  }

  // 2. Process folders with timestamp comparison & tombstones
  for (const clientFolder of clientFolders) {
    const id = String(clientFolder.id);
    if (deletedFolderIdSet.has(id)) continue;
    const serverFolder = serverFolderMap.get(id);
    if (!serverFolder) {
      if (isBlockedByFolderTombstone(clientFolder, userStore.deletedFolders?.[id])) {
        continue;
      }
      delete userStore.deletedFolders![id];
      mergedFoldersMap.set(id, clientFolder);
    } else {
      const clientTime = getEntityTimestampMs(clientFolder);
      const serverTime = getEntityTimestampMs(serverFolder);
      if (clientTime === 0 && serverTime === 0) {
        mergedFoldersMap.set(id, clientFolder);
      } else if (clientTime >= serverTime) {
        mergedFoldersMap.set(id, clientFolder);
      } else {
        mergedFoldersMap.set(id, serverFolder);
      }
    }
  }

  for (const serverFolder of userStore.folders) {
    const id = String(serverFolder.id);
    if (deletedFolderIdSet.has(id)) continue;
    if (!mergedFoldersMap.has(id)) {
      mergedFoldersMap.set(id, serverFolder);
    }
  }

  // 2.5 Process Bookmark Categories with timestamp comparison & tombstones
  const serverCategoryMap = new Map<string, BookmarkCategory>(
    (userStore.bookmarkCategories || []).map((c) => [String(c.id), c])
  );
  const mergedCategoriesMap = new Map<string, BookmarkCategory>();

  for (const clientCat of clientBookmarkCategories) {
    const id = String(clientCat.id);
    if (deletedBookmarkCategoryIdSet.has(id)) continue;
    const serverCat = serverCategoryMap.get(id);
    if (!serverCat) {
      const tombMs = userStore.deletedBookmarkCategories?.[id];
      const clientTime = getEntityTimestampMs(clientCat);
      if (tombMs && (clientTime === 0 || clientTime <= tombMs)) {
        continue;
      }
      delete userStore.deletedBookmarkCategories![id];
      mergedCategoriesMap.set(id, clientCat);
    } else {
      const clientTime = getEntityTimestampMs(clientCat);
      const serverTime = getEntityTimestampMs(serverCat);
      if (clientTime === 0 && serverTime === 0) {
        mergedCategoriesMap.set(id, clientCat);
      } else if (clientTime >= serverTime) {
        mergedCategoriesMap.set(id, clientCat);
      } else {
        mergedCategoriesMap.set(id, serverCat);
      }
    }
  }

  for (const serverCat of userStore.bookmarkCategories || []) {
    const id = String(serverCat.id);
    if (deletedBookmarkCategoryIdSet.has(id)) continue;
    if (!mergedCategoriesMap.has(id)) {
      mergedCategoriesMap.set(id, serverCat);
    }
  }

  // 2.6 Process Bookmarks with timestamp comparison & tombstones
  const serverBookmarkMap = new Map<string, Bookmark>(
    (userStore.bookmarks || []).map((b) => [String(b.id), b])
  );
  const mergedBookmarksMap = new Map<string, Bookmark>();

  for (const clientBm of clientBookmarks) {
    const id = String(clientBm.id);
    if (deletedBookmarkIdSet.has(id)) continue;
    const serverBm = serverBookmarkMap.get(id);
    if (!serverBm) {
      const tombMs = userStore.deletedBookmarks?.[id];
      const clientTime = getEntityTimestampMs(clientBm);
      if (tombMs && (clientTime === 0 || clientTime <= tombMs)) {
        continue;
      }
      delete userStore.deletedBookmarks![id];
      mergedBookmarksMap.set(id, clientBm);
    } else {
      const clientTime = getEntityTimestampMs(clientBm);
      const serverTime = getEntityTimestampMs(serverBm);
      if (clientTime >= serverTime) {
        mergedBookmarksMap.set(id, clientBm);
      } else {
        mergedBookmarksMap.set(id, serverBm);
      }
    }
  }

  for (const serverBm of userStore.bookmarks || []) {
    const id = String(serverBm.id);
    if (deletedBookmarkIdSet.has(id)) continue;
    if (!mergedBookmarksMap.has(id)) {
      mergedBookmarksMap.set(id, serverBm);
    }
  }

  const finalMergedNotes = Array.from(mergedNotesMap.values());
  const finalMergedFolders = Array.from(mergedFoldersMap.values());
  const finalMergedBookmarkCategories = Array.from(mergedCategoriesMap.values()).sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );
  const validCategoryIdSet = new Set(finalMergedBookmarkCategories.map((c) => String(c.id)));
  const finalMergedBookmarks = Array.from(mergedBookmarksMap.values()).map((b) =>
    b.categoryId && !validCategoryIdSet.has(String(b.categoryId)) ? { ...b, categoryId: '' } : b
  );

  // 3. Process frequentFolderIds
  let finalFrequentFolderIds = userStore.frequentFolderIds || [];
  if (Array.isArray(body.frequentFolderIds)) {
    finalFrequentFolderIds = body.frequentFolderIds.map(String);
  } else if (Array.isArray(body.frequentFolders)) {
    finalFrequentFolderIds = body.frequentFolders.map(String);
  }

  const validFolderIdSet = new Set(finalMergedFolders.map((f) => String(f.id)));
  finalFrequentFolderIds = finalFrequentFolderIds.filter(
    (fid) => validFolderIdSet.has(fid) && !deletedFolderIdSet.has(fid)
  );

  // Save to server database
  userStore.notes = finalMergedNotes;
  userStore.folders = finalMergedFolders;
  userStore.frequentFolderIds = finalFrequentFolderIds;
  userStore.bookmarks = finalMergedBookmarks;
  userStore.bookmarkCategories = finalMergedBookmarkCategories;
  userStore.updatedAt = now;
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端双向智能同步成功！数据已更新至最新状态',
    data: {
      notes: finalMergedNotes,
      folders: finalMergedFolders,
      frequentFolderIds: finalFrequentFolderIds,
      bookmarks: finalMergedBookmarks,
      bookmarkCategories: finalMergedBookmarkCategories,
      deletedNotes: userStore.deletedNotes || {},
      deletedFolders: userStore.deletedFolders || {},
      deletedBookmarks: userStore.deletedBookmarks || {},
      deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
      notesCount: finalMergedNotes.length,
      foldersCount: finalMergedFolders.length,
      frequentFoldersCount: finalFrequentFolderIds.length,
      bookmarksCount: finalMergedBookmarks.length,
      bookmarkCategoriesCount: finalMergedBookmarkCategories.length,
      serverTime: now,
    },
    notes: finalMergedNotes,
    folders: finalMergedFolders,
    frequentFolderIds: finalFrequentFolderIds,
    bookmarks: finalMergedBookmarks,
    bookmarkCategories: finalMergedBookmarkCategories,
    deletedNotes: userStore.deletedNotes || {},
    deletedFolders: userStore.deletedFolders || {},
    deletedBookmarks: userStore.deletedBookmarks || {},
    deletedBookmarkCategories: userStore.deletedBookmarkCategories || {},
    serverTime: now,
  });
}

app.post('/api/sync', handleSync);
app.get('/api/sync', (req, res) => {
  const action = req.query.action as string;
  if (action === 'pull') {
    return handleGetAllData(req, res);
  }
  return handleSync(req, res);
});

// ==========================================
// 4. Single Note Upsert & Delete (Incremental)
// ==========================================
function handleUpsertNote(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const note: Note = req.body.note || req.body;

  if (!note || !note.id) {
    return res.status(400).json({ code: 400, success: false, message: '缺少有效的笔记数据' });
  }

  const idx = userStore.notes.findIndex((n) => String(n.id) === String(note.id));
  if (idx !== -1) {
    userStore.notes[idx] = { ...userStore.notes[idx], ...note };
  } else {
    userStore.notes.unshift(note);
  }
  delete userStore.deletedNotes![String(note.id)];

  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '笔记已增量同步至云端',
    data: { id: note.id, updatedAt: note.updatedAt || new Date().toISOString() },
    serverTime: Date.now(),
  });
}

function handleDeleteNote(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const noteId = req.params.id || (req.query.id as string) || req.body?.id;

  if (!noteId) {
    return res.status(400).json({ code: 400, success: false, message: '缺少笔记 ID' });
  }

  const opTs = Math.max(Date.now(), Number(req.body?.timestamp) || 0);
  userStore.notes = userStore.notes.filter((n) => String(n.id) !== String(noteId));
  recordTombstones(userStore.deletedNotes!, [String(noteId)], opTs);
  userStore.updatedAt = opTs;
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端笔记已删除',
    data: { id: noteId, deleted: true },
    serverTime: Date.now(),
  });
}

app.post('/api/notes', handleUpsertNote);
app.put('/api/notes', handleUpsertNote);
app.delete('/api/notes/:id', handleDeleteNote);
app.delete('/api/notes', handleDeleteNote);

// ==========================================
// 5. Folder Upsert & Delete (Incremental & Batch)
// ==========================================
function handleUpsertFolder(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  
  const foldersToUpsert: Folder[] = Array.isArray(req.body.folders)
    ? req.body.folders
    : req.body.folder
    ? [req.body.folder]
    : req.body.id
    ? [req.body]
    : [];

  if (!foldersToUpsert || foldersToUpsert.length === 0) {
    return res.status(400).json({ code: 400, success: false, message: '缺少有效的文件夹数据' });
  }

  for (const folder of foldersToUpsert) {
    if (!folder || !folder.id) continue;
    const cleanFolder: Folder = {
      ...folder,
      order: typeof folder.order === 'number' && !isNaN(folder.order) ? folder.order : 0,
    };
    const idx = userStore.folders.findIndex((f) => String(f.id) === String(folder.id));
    if (idx !== -1) {
      userStore.folders[idx] = { ...userStore.folders[idx], ...cleanFolder };
    } else {
      userStore.folders.push(cleanFolder);
    }
    delete userStore.deletedFolders![String(folder.id)];
  }

  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: `${foldersToUpsert.length} 个文件夹已同步至云端`,
    data: { count: foldersToUpsert.length, ids: foldersToUpsert.map((f) => f.id) },
    serverTime: Date.now(),
  });
}

function handleDeleteFolder(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const folderId = req.params.id || (req.query.id as string) || req.body?.id;

  if (!folderId) {
    return res.status(400).json({ code: 400, success: false, message: '缺少文件夹 ID' });
  }

  const nowMs = Date.now();
  const opTs = Math.max(nowMs, Number(req.body?.timestamp) || 0);
  const allDeletedFolderIds = collectDescendantFolderIds(userStore.folders, String(folderId));
  userStore.folders = userStore.folders.filter((f) => !allDeletedFolderIds.has(String(f.id)));
  recordTombstones(userStore.deletedFolders!, allDeletedFolderIds, opTs);

  // Soft-delete notes inside deleted folders
  const nowStr = formatServerDateTime();
  userStore.notes.forEach((n) => {
    if (allDeletedFolderIds.has(String(n.folderId)) && !n.isDeleted) {
      n.isDeleted = true;
      n.deletedAt = nowStr;
      n.updatedAt = nowStr;
      n.updatedAtMs = nowMs;
    }
  });

  // Remove deleted folders from frequentFolderIds
  userStore.frequentFolderIds = (userStore.frequentFolderIds || []).filter(
    (fid) => !allDeletedFolderIds.has(String(fid))
  );

  userStore.updatedAt = nowMs;
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端文件夹已删除',
    data: { id: folderId, deletedIds: Array.from(allDeletedFolderIds), deleted: true },
    serverTime: nowMs,
  });
}

// 5.1 Empty Trash
function handleEmptyTrash(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const noteIds: string[] = Array.isArray(req.body?.noteIds) ? req.body.noteIds.map(String) : [];
  const opTs = Math.max(Date.now(), Number(req.body?.timestamp) || 0);

  let removedIds: string[] = [];
  if (noteIds.length > 0) {
    const idSet = new Set(noteIds);
    removedIds = noteIds;
    userStore.notes = userStore.notes.filter((n) => !idSet.has(String(n.id)));
  } else {
    removedIds = userStore.notes.filter((n) => n.isDeleted).map((n) => String(n.id));
    userStore.notes = userStore.notes.filter((n) => !n.isDeleted);
  }

  recordTombstones(userStore.deletedNotes!, removedIds, opTs);
  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端回收站已清空',
    data: { deletedCount: removedIds.length, deletedIds: removedIds },
    serverTime: Date.now(),
  });
}

app.post('/api/folders', handleUpsertFolder);
app.put('/api/folders', handleUpsertFolder);
app.delete('/api/folders/:id', handleDeleteFolder);
app.delete('/api/folders', handleDeleteFolder);
app.post('/api/trash/empty', handleEmptyTrash);

// ==========================================
// 5.2 Frequent / Pinned Folders Operations
// ==========================================
function handleGetFrequentFolders(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  return res.json({
    code: 200,
    success: true,
    message: '常用目录获取成功',
    data: {
      frequentFolderIds: userStore.frequentFolderIds || [],
      count: (userStore.frequentFolderIds || []).length,
      serverTime: Date.now(),
    },
    frequentFolderIds: userStore.frequentFolderIds || [],
    serverTime: Date.now(),
  });
}

function handleUpsertFrequentFolders(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const rawIds = req.body?.frequentFolderIds || req.body?.ids || req.body?.folderIds;
  const singleFolderId = req.body?.folderId || req.body?.id;
  const action = req.body?.action; // 'add' | 'remove' | 'reorder' | undefined

  if (Array.isArray(rawIds)) {
    userStore.frequentFolderIds = rawIds.map(String);
  } else if (singleFolderId) {
    const fid = String(singleFolderId);
    userStore.frequentFolderIds = userStore.frequentFolderIds || [];
    if (action === 'remove') {
      userStore.frequentFolderIds = userStore.frequentFolderIds.filter((id) => id !== fid);
    } else {
      if (!userStore.frequentFolderIds.includes(fid)) {
        userStore.frequentFolderIds.push(fid);
      }
    }
  }

  // Filter valid folders
  const validFolderIds = new Set(userStore.folders.map((f) => String(f.id)));
  userStore.frequentFolderIds = (userStore.frequentFolderIds || []).filter((id) => validFolderIds.has(String(id)));
  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '常用目录已同步更新至云端',
    data: {
      frequentFolderIds: userStore.frequentFolderIds,
      count: userStore.frequentFolderIds.length,
      serverTime: Date.now(),
    },
    frequentFolderIds: userStore.frequentFolderIds,
    serverTime: Date.now(),
  });
}

function handleDeleteFrequentFolder(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const folderId = req.params.id || (req.query.id as string) || req.body?.id || req.body?.folderId;
  if (!folderId) {
    return res.status(400).json({ code: 400, success: false, message: '缺少文件夹 ID' });
  }

  userStore.frequentFolderIds = (userStore.frequentFolderIds || []).filter((id) => String(id) !== String(folderId));
  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '常用目录已从云端移除',
    data: {
      id: folderId,
      frequentFolderIds: userStore.frequentFolderIds,
      serverTime: Date.now(),
    },
    frequentFolderIds: userStore.frequentFolderIds,
    serverTime: Date.now(),
  });
}

app.get('/api/frequent-folders', handleGetFrequentFolders);
app.post('/api/frequent-folders', handleUpsertFrequentFolders);
app.put('/api/frequent-folders', handleUpsertFrequentFolders);
app.delete('/api/frequent-folders/:id', handleDeleteFrequentFolder);
app.delete('/api/frequent-folders', handleDeleteFrequentFolder);

// ==========================================
// 5.3 Bookmarks & Bookmark Categories (Incremental CRUD + Direct Permanent Delete)
// ==========================================
function handleUpsertBookmarks(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const items: Bookmark[] = Array.isArray(req.body?.bookmarks)
    ? req.body.bookmarks
    : req.body?.bookmark
    ? [req.body.bookmark]
    : req.body?.id
    ? [req.body]
    : [];

  if (items.length === 0) {
    return res.status(400).json({ code: 400, success: false, message: '缺少有效的书签数据' });
  }

  userStore.bookmarks = userStore.bookmarks || [];
  for (const bm of items) {
    if (!bm || !bm.id) continue;
    const idx = userStore.bookmarks.findIndex((b) => String(b.id) === String(bm.id));
    if (idx !== -1) {
      userStore.bookmarks[idx] = { ...userStore.bookmarks[idx], ...bm };
    } else {
      userStore.bookmarks.unshift(bm);
    }
    delete userStore.deletedBookmarks![String(bm.id)];
  }

  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: `${items.length} 个书签已同步至云端`,
    data: { count: items.length, ids: items.map((b) => b.id) },
    serverTime: Date.now(),
  });
}

function handleDeleteBookmark(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const bookmarkId = req.params.id || (req.query.id as string) || req.body?.id;

  if (!bookmarkId) {
    return res.status(400).json({ code: 400, success: false, message: '缺少书签 ID' });
  }

  const opTs = Math.max(Date.now(), Number(req.body?.timestamp) || 0);
  userStore.bookmarks = (userStore.bookmarks || []).filter(
    (b) => String(b.id) !== String(bookmarkId)
  );
  recordTombstones(userStore.deletedBookmarks!, [String(bookmarkId)], opTs);
  userStore.updatedAt = opTs;
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端书签已彻底删除',
    data: { id: bookmarkId, deleted: true },
    serverTime: Date.now(),
  });
}

function handleUpsertBookmarkCategories(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const items: BookmarkCategory[] = Array.isArray(req.body?.categories)
    ? req.body.categories
    : req.body?.category
    ? [req.body.category]
    : req.body?.id
    ? [req.body]
    : [];

  if (items.length === 0) {
    return res.status(400).json({ code: 400, success: false, message: '缺少有效的书签分类数据' });
  }

  userStore.bookmarkCategories = userStore.bookmarkCategories || [];
  for (const cat of items) {
    if (!cat || !cat.id) continue;
    const cleanCat: BookmarkCategory = {
      ...cat,
      parentId: cat.parentId ? String(cat.parentId) : null,
      isOpen: cat.isOpen !== undefined ? Boolean(cat.isOpen) : true,
      order: typeof cat.order === 'number' && !isNaN(cat.order) ? cat.order : 0,
    };
    const idx = userStore.bookmarkCategories.findIndex((c) => String(c.id) === String(cat.id));
    if (idx !== -1) {
      userStore.bookmarkCategories[idx] = { ...userStore.bookmarkCategories[idx], ...cleanCat };
    } else {
      userStore.bookmarkCategories.push(cleanCat);
    }
    delete userStore.deletedBookmarkCategories![String(cat.id)];
  }

  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: `${items.length} 个书签目录已同步至云端`,
    data: { count: items.length, ids: items.map((c) => c.id) },
    serverTime: Date.now(),
  });
}

function handleDeleteBookmarkCategory(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const categoryId = req.params.id || (req.query.id as string) || req.body?.id;

  if (!categoryId) {
    return res.status(400).json({ code: 400, success: false, message: '缺少书签目录 ID' });
  }

  const nowMs = Date.now();
  const opTs = Math.max(nowMs, Number(req.body?.timestamp) || 0);
  const existingCats = userStore.bookmarkCategories || [];
  const targetCat = existingCats.find((c) => String(c.id) === String(categoryId));

  // Collect target category and all descendant categories
  const idsToDelete = new Set<string>([String(categoryId)]);
  let added = true;
  while (added) {
    added = false;
    for (const c of existingCats) {
      const cid = String(c.id);
      const pid = c.parentId ? String(c.parentId) : null;
      if (pid && idsToDelete.has(pid) && !idsToDelete.has(cid)) {
        idsToDelete.add(cid);
        added = true;
      }
    }
  }

  const fallbackCategoryId =
    targetCat?.parentId && !idsToDelete.has(String(targetCat.parentId))
      ? String(targetCat.parentId)
      : '';

  userStore.bookmarkCategories = existingCats.filter((c) => !idsToDelete.has(String(c.id)));
  recordTombstones(userStore.deletedBookmarkCategories!, idsToDelete, opTs);

  // Move bookmarks in deleted categories safely to parent or root ('')
  const nowStr = formatServerDateTime();
  (userStore.bookmarks || []).forEach((b) => {
    if (idsToDelete.has(String(b.categoryId))) {
      b.categoryId = fallbackCategoryId;
      b.updatedAt = nowStr;
      b.updatedAtMs = nowMs;
    }
  });

  userStore.updatedAt = nowMs;
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端书签目录已删除',
    data: { id: categoryId, deletedIds: Array.from(idsToDelete), deleted: true },
    serverTime: nowMs,
  });
}

app.post('/api/bookmarks', handleUpsertBookmarks);
app.put('/api/bookmarks', handleUpsertBookmarks);
app.delete('/api/bookmarks/:id', handleDeleteBookmark);
app.delete('/api/bookmarks', handleDeleteBookmark);

app.post('/api/bookmark-categories', handleUpsertBookmarkCategories);
app.put('/api/bookmark-categories', handleUpsertBookmarkCategories);
app.delete('/api/bookmark-categories/:id', handleDeleteBookmarkCategory);
app.delete('/api/bookmark-categories', handleDeleteBookmarkCategory);

// ==========================================
// 6. Unified Query Dispatcher for /api.php & /api
// ==========================================
app.all(['/api.php', '/api'], (req, res) => {
  const action = (req.query.action as string) || req.body?.action || '';

  if (action === 'ping' || action === 'health') {
    return handlePing(req, res);
  }
  if (action === 'data' || action === 'pull') {
    return handleGetAllData(req, res);
  }
  if (action === 'sync' || action === 'merge' || action === 'push_all' || action === 'pull_all') {
    return handleSync(req, res);
  }
  if (action === 'upsert_note') {
    return handleUpsertNote(req, res);
  }
  if (action === 'delete_note') {
    return handleDeleteNote(req, res);
  }
  if (action === 'upsert_folder') {
    return handleUpsertFolder(req, res);
  }
  if (action === 'delete_folder') {
    return handleDeleteFolder(req, res);
  }
  if (action === 'frequent_folders' || action === 'get_frequent_folders') {
    return handleGetFrequentFolders(req, res);
  }
  if (action === 'upsert_frequent_folders' || action === 'save_frequent_folders' || action === 'update_frequent_folders') {
    return handleUpsertFrequentFolders(req, res);
  }
  if (action === 'delete_frequent_folder' || action === 'remove_frequent_folder') {
    return handleDeleteFrequentFolder(req, res);
  }
  if (action === 'empty_trash') {
    return handleEmptyTrash(req, res);
  }
  if (action === 'upsert_bookmark' || action === 'save_bookmark') {
    return handleUpsertBookmarks(req, res);
  }
  if (action === 'delete_bookmark') {
    return handleDeleteBookmark(req, res);
  }
  if (action === 'upsert_bookmark_category' || action === 'save_bookmark_category') {
    return handleUpsertBookmarkCategories(req, res);
  }
  if (action === 'delete_bookmark_category') {
    return handleDeleteBookmarkCategory(req, res);
  }

  // Default fallback for GET
  if (req.method === 'GET') {
    return handleGetAllData(req, res);
  }

  return res.status(400).json({
    code: 400,
    success: false,
    message: `未知的操作指令 action: ${action}`,
  });
});

// ==========================================
// 7. Start Server with Vite Middleware or Static
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Maple Cloud Notes Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
