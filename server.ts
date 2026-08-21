import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { INITIAL_FOLDERS, INITIAL_NOTES } from './src/data/initialData';
import { Folder, Note } from './src/types';

const app = express();
const PORT = 3000;

// Path to durable storage file
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cloud_sync_db.json');

// Interface for server-side stored user database
interface UserDataStore {
  notes: Note[];
  folders: Folder[];
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
      updatedAt: Date.now(),
    };
    saveDatabase();
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
      version: '2.0.0',
      status: 'ready',
      userId,
      noteCount: userStore.notes.length,
      folderCount: userStore.folders.length,
      serverTime: Date.now(),
      supportedFeatures: ['incremental_note_sync', 'incremental_folder_sync', 'batch_merge_sync', 'indexeddb_sync'],
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
      notesCount: userStore.notes.length,
      foldersCount: userStore.folders.length,
      serverTime: Date.now(),
    },
    notes: userStore.notes,
    folders: userStore.folders,
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

  const now = Date.now();

  // Mode: push_all (Overwrite cloud with client data)
  if (mode === 'push_all') {
    userStore.notes = clientNotes;
    userStore.folders = clientFolders;
    userStore.updatedAt = now;
    saveDatabase();

    return res.json({
      code: 200,
      success: true,
      message: '本地数据已完全强制覆盖上传至云端服务器！',
      data: {
        notes: userStore.notes,
        folders: userStore.folders,
        serverTime: now,
      },
      notes: userStore.notes,
      folders: userStore.folders,
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
        serverTime: now,
      },
      notes: userStore.notes,
      folders: userStore.folders,
      serverTime: now,
    });
  }

  // Mode: merge (Two-way smart merge based on timestamp)
  const serverNoteMap = new Map<string, Note>(userStore.notes.map((n) => [String(n.id), n]));
  const serverFolderMap = new Map<string, Folder>(userStore.folders.map((f) => [String(f.id), f]));

  const mergedNotesMap = new Map<string, Note>();
  const mergedFoldersMap = new Map<string, Folder>();

  // 1. Process client notes vs server notes
  for (const clientNote of clientNotes) {
    const id = String(clientNote.id);
    const serverNote = serverNoteMap.get(id);

    if (!serverNote) {
      // Note only in client -> add to merged
      mergedNotesMap.set(id, clientNote);
    } else {
      // Note exists in both -> compare update times
      const clientTime = parseSafeTime(clientNote.updatedAt || clientNote.createdAt);
      const serverTime = parseSafeTime(serverNote.updatedAt || serverNote.createdAt);

      if (clientTime >= serverTime) {
        mergedNotesMap.set(id, clientNote);
      } else {
        mergedNotesMap.set(id, serverNote);
      }
    }
  }

  // Add notes that only exist on server
  for (const serverNote of userStore.notes) {
    const id = String(serverNote.id);
    if (!mergedNotesMap.has(id)) {
      mergedNotesMap.set(id, serverNote);
    }
  }

  // 2. Process folders
  for (const clientFolder of clientFolders) {
    const id = String(clientFolder.id);
    mergedFoldersMap.set(id, clientFolder);
  }

  for (const serverFolder of userStore.folders) {
    const id = String(serverFolder.id);
    if (!mergedFoldersMap.has(id)) {
      mergedFoldersMap.set(id, serverFolder);
    }
  }

  const finalMergedNotes = Array.from(mergedNotesMap.values());
  const finalMergedFolders = Array.from(mergedFoldersMap.values());

  // Save to server database
  userStore.notes = finalMergedNotes;
  userStore.folders = finalMergedFolders;
  userStore.updatedAt = now;
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端双向智能同步成功！数据已更新至最新状态',
    data: {
      notes: finalMergedNotes,
      folders: finalMergedFolders,
      notesCount: finalMergedNotes.length,
      foldersCount: finalMergedFolders.length,
      serverTime: now,
    },
    notes: finalMergedNotes,
    folders: finalMergedFolders,
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

  userStore.notes = userStore.notes.filter((n) => String(n.id) !== String(noteId));
  userStore.updatedAt = Date.now();
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

  userStore.folders = userStore.folders.filter((f) => String(f.id) !== String(folderId));
  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端文件夹已删除',
    data: { id: folderId, deleted: true },
    serverTime: Date.now(),
  });
}

// 5.1 Empty Trash
function handleEmptyTrash(req: express.Request, res: express.Response) {
  const userId = extractUserId(req);
  const userStore = getUserStore(userId);
  const noteIds: string[] = req.body?.noteIds || [];

  if (Array.isArray(noteIds) && noteIds.length > 0) {
    const idSet = new Set(noteIds.map((id) => String(id)));
    userStore.notes = userStore.notes.filter((n) => !idSet.has(String(n.id)));
  } else {
    userStore.notes = userStore.notes.filter((n) => !n.isDeleted);
  }

  userStore.updatedAt = Date.now();
  saveDatabase();

  return res.json({
    code: 200,
    success: true,
    message: '云端回收站已清空',
    data: { deletedCount: noteIds.length },
    serverTime: Date.now(),
  });
}

app.post('/api/folders', handleUpsertFolder);
app.put('/api/folders', handleUpsertFolder);
app.delete('/api/folders/:id', handleDeleteFolder);
app.delete('/api/folders', handleDeleteFolder);
app.post('/api/trash/empty', handleEmptyTrash);

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
  if (action === 'empty_trash') {
    return handleEmptyTrash(req, res);
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
