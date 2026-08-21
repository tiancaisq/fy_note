import { CloudConfig, Folder, Note, SyncDiffResult } from '../types';

export interface CloudSyncResponse {
  code: number | string;
  message?: string;
  msg?: string;
  success?: boolean;
  data?: {
    serverTime?: number;
    notes?: Note[];
    folders?: Folder[];
  };
  notes?: Note[];
  folders?: Folder[];
  serverTime?: number;
}

export interface CloudTestResponse {
  code?: number | string;
  message?: string;
  msg?: string;
  success?: boolean;
  status?: string | number;
  data?: {
    serverTime?: number;
    user?: string;
    version?: string;
    noteCount?: number;
    folderCount?: number;
  };
}

// Clean and normalize API base URL
export function normalizeApiUrl(url: string): string {
  let trimmed = (url || '').trim();
  if (!trimmed) return '';

  // Handle relative URLs (e.g. "/api" or "/api/")
  if (trimmed.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${trimmed}`.replace(/\/+$/, '');
    }
    return trimmed.replace(/\/+$/, '');
  }

  // Handle protocol-relative URLs (e.g. "//localhost:3000/api")
  if (trimmed.startsWith('//')) {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
    return `${protocol}${trimmed}`.replace(/\/+$/, '');
  }

  // Add protocol if missing
  if (!/^https?:\/\//i.test(trimmed)) {
    // If running in HTTPS browser environment and user points to external domain without protocol, default to https
    const defaultProto =
      typeof window !== 'undefined' && window.location.protocol === 'https:' && !trimmed.startsWith('localhost') && !trimmed.startsWith('127.0.0.1')
        ? 'https://'
        : 'http://';
    trimmed = defaultProto + trimmed;
  }
  return trimmed.replace(/\/+$/, '');
}

/**
 * Standardize note fields coming from server (e.g. folder_id -> folderId, is_starred -> isStarred, JSON tags)
 */
export function normalizeRemoteNote(raw: any): Note {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'note-' + Date.now(),
      title: '未命名笔记',
      content: '',
      folderId: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isStarred: false,
      isFavorite: false,
      isShared: false,
      isDeleted: false,
      tags: [],
      format: 'markdown',
    };
  }

  // Parse tags safely
  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags.map((t: any) => String(t));
  } else if (typeof raw.tags === 'string' && raw.tags.trim()) {
    try {
      const parsed = JSON.parse(raw.tags);
      if (Array.isArray(parsed)) {
        tags = parsed.map((t: any) => String(t));
      } else {
        tags = [raw.tags];
      }
    } catch {
      tags = raw.tags.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }

  const format = raw.format === 'mindmap' || raw.type === 'mindmap' ? 'mindmap' : (raw.format || 'markdown');

  return {
    id: String(raw.id || raw.noteId || raw._id || 'note-' + Date.now()),
    title: String(raw.title !== undefined && raw.title !== null ? raw.title : '未命名笔记'),
    content: String(raw.content !== undefined && raw.content !== null ? raw.content : ''),
    folderId: String(raw.folderId ?? raw.folder_id ?? raw.folder ?? ''),
    createdAt: String(raw.createdAt || raw.created_at || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || new Date().toISOString()),
    isStarred: Boolean(raw.isStarred || raw.is_starred || raw.starred),
    isFavorite: Boolean(raw.isFavorite || raw.is_favorite || raw.favorite),
    isShared: Boolean(raw.isShared || raw.is_shared || raw.shared),
    isDeleted: Boolean(raw.isDeleted || raw.is_deleted || raw.deleted),
    deletedAt: raw.deletedAt || raw.deleted_at || undefined,
    shareUrl: raw.shareUrl || raw.share_url || undefined,
    tags,
    format,
    type: format,
  };
}

/**
 * Standardize folder fields coming from server (e.g. parent_id -> parentId, is_collapsed -> isOpen)
 */
export function normalizeRemoteFolder(raw: any): Folder {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'folder-' + Date.now(),
      name: '新建文件夹',
      parentId: null,
      isOpen: true,
      order: 1,
    };
  }

  const rawParent = raw.parentId !== undefined ? raw.parentId : (raw.parent_id !== undefined ? raw.parent_id : null);
  const parentId = rawParent === '' || rawParent === '0' || rawParent === 0 ? null : (rawParent ? String(rawParent) : null);
  const isOpen = raw.isOpen !== undefined ? Boolean(raw.isOpen) : (raw.is_collapsed !== undefined ? !raw.is_collapsed : true);

  return {
    id: String(raw.id || raw.folderId || 'folder-' + Date.now()),
    name: String(raw.name || raw.folderName || '新建文件夹'),
    parentId,
    isOpen,
    order: Number(raw.order || raw.order_num || raw.sort || 0),
  };
}

// Build standard request headers
function getHeaders(config: CloudConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
  };
  if (config.apiToken && config.apiToken.trim()) {
    headers['Authorization'] = `Bearer ${config.apiToken.trim()}`;
    headers['X-Api-Key'] = config.apiToken.trim();
  }
  if (config.userId && config.userId.trim()) {
    headers['X-User-Id'] = config.userId.trim();
  }
  return headers;
}

// Helper to generate candidate URLs for any action across PHP, REST, and query-param setups
function getActionCandidateUrls(baseUrl: string, action: string, restPath?: string): string[] {
  const normalized = normalizeApiUrl(baseUrl);
  if (!normalized) return [];

  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (u: string) => {
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  };

  const isPhp = normalized.includes('.php');
  const endsWithApi = normalized.endsWith('/api');
  const baseWithoutApi = endsWithApi ? normalized.replace(/\/api$/, '') : normalized;

  if (isPhp) {
    const sep = normalized.includes('?') ? '&' : '?';
    add(`${normalized}${sep}action=${action}`);
    add(normalized);
  } else {
    // 1. If base ends with /api (e.g. http://localhost:8000/api)
    if (endsWithApi) {
      if (restPath) add(`${normalized}${restPath}`);
      add(`${normalized}?action=${action}`);
      add(`${baseWithoutApi}/api.php?action=${action}`);
      add(`${normalized}/api.php?action=${action}`);
      add(`${normalized}`);
    } else {
      // 2. Base is domain or root (e.g. http://localhost:8000)
      if (restPath) add(`${normalized}/api${restPath}`);
      if (restPath) add(`${normalized}${restPath}`);
      add(`${normalized}/api.php?action=${action}`);
      add(`${normalized}/api?action=${action}`);
      add(`${normalized}?action=${action}`);
      add(`${normalized}`);
    }
  }

  return urls;
}

// Helper to determine if code / status / success flag indicates success
function isResponseSuccessful(data: any, httpOk: boolean): boolean {
  if (!data) return httpOk;

  // 1. Check explicit 'success' boolean
  if (data.success !== undefined && data.success !== null) {
    return Boolean(data.success);
  }

  // 2. Check 'code' (200, "200", 0, "0" are common success codes)
  if (data.code !== undefined && data.code !== null) {
    const num = Number(data.code);
    if (!isNaN(num)) {
      return num === 200 || num === 0;
    }
    return data.code === '200' || data.code === '0';
  }

  // 3. Check 'status' (200, "success", "ok")
  if (data.status !== undefined && data.status !== null) {
    if (typeof data.status === 'number') {
      return data.status >= 200 && data.status < 300;
    }
    const str = String(data.status).toLowerCase();
    return str === 'success' || str === 'ok' || str === '200' || str === '0';
  }

  // 4. Default to HTTP status ok if no error field
  return httpOk && !data.error && !data.err;
}

// Extract human message from server response
function extractResponseMessage(data: any, fallback: string): string {
  if (!data) return fallback;
  return data.message || data.msg || data.info || data.error || fallback;
}

// 1. Test Server Connectivity
export async function testCloudApi(config: CloudConfig): Promise<{ success: boolean; message: string; data?: any }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) {
    return { success: false, message: '请输入有效的云端 API 地址' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const candidates = getActionCandidateUrls(baseUrl, 'ping', '/ping');

    let lastError = '';
    let matchedRes: Response | null = null;
    const headers = getHeaders(config);

    for (const url of candidates) {
      try {
        // Try GET first
        let res = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        // If method not allowed, try POST
        if (res.status === 405) {
          res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'ping', timestamp: Date.now() }),
            signal: controller.signal,
          });
        }

        // If 401 or 403, stop immediately as auth failed
        if (res.status === 401 || res.status === 403) {
          clearTimeout(timeoutId);
          return {
            success: false,
            message: '认证失败：API Token 无效或未授权，请检查凭据设置',
          };
        }

        if (res.ok) {
          matchedRes = res;
          break;
        } else if (res.status !== 404 && res.status !== 405) {
          matchedRes = res;
          break;
        }
      } catch (err: any) {
        lastError = err.message || '';
        if (err.name === 'AbortError') {
          clearTimeout(timeoutId);
          return { success: false, message: '连接超时（超过8秒），请检查服务端地址或网络连接' };
        }
      }
    }

    clearTimeout(timeoutId);

    if (!matchedRes) {
      return {
        success: false,
        message: lastError
          ? `无法连接到服务端 (${lastError})。请确保服务端已启动并开启 CORS 跨域支持。`
          : '无法连接到服务端，未找到有效的 API 测试接口，请确认 URL 地址。',
      };
    }

    // Try parsing JSON
    const data = await matchedRes.json().catch(() => null);

    if (!matchedRes.ok) {
      return {
        success: false,
        message: extractResponseMessage(data, `服务端响应异常 (HTTP ${matchedRes.status}): ${matchedRes.statusText || '请求失败'}`),
      };
    }

    const isSuccess = isResponseSuccessful(data, matchedRes.ok);

    if (!isSuccess) {
      return {
        success: false,
        message: extractResponseMessage(data, '服务端返回连接未就绪状态'),
      };
    }

    return {
      success: true,
      message: extractResponseMessage(data, '云端连接成功！服务正常运行'),
      data: data?.data || data,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `连接失败: ${err.message || '未知网络错误'}`,
    };
  }
}

// 2. Fetch Remote Data from Cloud
export async function fetchRemoteData(config: CloudConfig): Promise<{ success: boolean; data?: { notes: Note[]; folders: Folder[]; serverTime: number }; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urlsToTry = getActionCandidateUrls(baseUrl, 'pull', '/sync?action=pull');
    // Also include 'data' actions
    const dataUrls = getActionCandidateUrls(baseUrl, 'data', '/data');
    for (const du of dataUrls) {
      if (!urlsToTry.includes(du)) urlsToTry.push(du);
    }

    let lastRes: Response | null = null;
    const headers = getHeaders(config);

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, { method: 'GET', headers });
        if (res.ok || res.status === 401 || res.status === 403) {
          lastRes = res;
          break;
        }
      } catch {}
    }

    if (!lastRes) {
      return { success: false, message: '无法连接到云端拉取数据接口，请确认服务端 API 地址' };
    }

    if (!lastRes.ok) {
      if (lastRes.status === 401 || lastRes.status === 403) {
        return { success: false, message: '认证失败：API Token 无效或已过期' };
      }
      return { success: false, message: `拉取数据失败 (HTTP ${lastRes.status})` };
    }

    const json = await lastRes.json().catch(() => null);
    if (!json) {
      return { success: false, message: '服务端返回的数据格式非有效 JSON' };
    }

    const isSuccess = isResponseSuccessful(json, lastRes.ok);
    const resData = json.data || json;

    const rawNotesList = Array.isArray(resData.notes)
      ? resData.notes
      : Array.isArray(json.notes)
      ? json.notes
      : Array.isArray(resData.mergedNotes)
      ? resData.mergedNotes
      : Array.isArray(json.mergedNotes)
      ? json.mergedNotes
      : Array.isArray(resData)
      ? resData
      : [];

    const rawFoldersList = Array.isArray(resData.folders)
      ? resData.folders
      : Array.isArray(json.folders)
      ? json.folders
      : Array.isArray(resData.mergedFolders)
      ? resData.mergedFolders
      : Array.isArray(json.mergedFolders)
      ? json.mergedFolders
      : [];

    if (!isSuccess && rawNotesList.length === 0 && rawFoldersList.length === 0 && !json.data) {
      return { success: false, message: extractResponseMessage(json, '服务端返回错误') };
    }

    const notes: Note[] = rawNotesList.map(normalizeRemoteNote);
    const folders: Folder[] = rawFoldersList.map(normalizeRemoteFolder);

    return {
      success: true,
      data: {
        notes,
        folders,
        serverTime: resData.serverTime || json.serverTime || Date.now(),
      },
    };
  } catch (err: any) {
    return { success: false, message: `网络拉取异常: ${err.message || '连接错误'}` };
  }
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

// 3. Compare and compute differences between local and cloud
export function calculateSyncDiff(
  localNotes: Note[],
  localFolders: Folder[],
  remoteNotes: Note[],
  remoteFolders: Folder[]
): SyncDiffResult {
  const remoteNoteList = Array.isArray(remoteNotes) ? remoteNotes : [];
  const remoteFolderList = Array.isArray(remoteFolders) ? remoteFolders : [];
  const localNoteList = Array.isArray(localNotes) ? localNotes : [];
  const localFolderList = Array.isArray(localFolders) ? localFolders : [];

  const remoteNoteMap = new Map(remoteNoteList.map((n) => [String(n.id), n]));
  const remoteFolderMap = new Map(remoteFolderList.map((f) => [String(f.id), f]));
  const localNoteMap = new Map(localNoteList.map((n) => [String(n.id), n]));
  const localFolderMap = new Map(localFolderList.map((f) => [String(f.id), f]));

  let localOnlyNotes = 0;
  let localUpdatedNotes = 0;
  let localOnlyFolders = 0;
  let cloudOnlyNotes = 0;
  let cloudUpdatedNotes = 0;
  let cloudOnlyFolders = 0;

  // Compare local notes against remote
  for (const local of localNoteList) {
    const remote = remoteNoteMap.get(String(local.id));
    if (!remote) {
      localOnlyNotes++;
    } else {
      const localTime = parseSafeTime(local.updatedAt || local.createdAt);
      const remoteTime = parseSafeTime(remote.updatedAt || remote.createdAt);

      if (localTime > remoteTime) {
        localUpdatedNotes++;
      } else if (localTime === remoteTime) {
        // If timestamps are identical, check if content or flags differ
        const isContentDiff =
          (local.title || '') !== (remote.title || '') ||
          (local.content || '') !== (remote.content || '') ||
          (local.folderId || '') !== (remote.folderId || '') ||
          Boolean(local.isStarred) !== Boolean(remote.isStarred) ||
          Boolean(local.isFavorite) !== Boolean(remote.isFavorite) ||
          Boolean(local.isDeleted) !== Boolean(remote.isDeleted) ||
          (local.format || 'markdown') !== (remote.format || 'markdown');
        if (isContentDiff) {
          localUpdatedNotes++;
        }
      }
    }
  }

  // Compare remote notes against local (for cloud-newer items)
  for (const remote of remoteNoteList) {
    const local = localNoteMap.get(String(remote.id));
    if (!local) {
      cloudOnlyNotes++;
    } else {
      const localTime = parseSafeTime(local.updatedAt || local.createdAt);
      const remoteTime = parseSafeTime(remote.updatedAt || remote.createdAt);
      if (remoteTime > localTime) {
        cloudUpdatedNotes++;
      }
    }
  }

  // Compare folders
  for (const localF of localFolderList) {
    if (!remoteFolderMap.has(String(localF.id))) {
      localOnlyFolders++;
    }
  }

  for (const remoteF of remoteFolderList) {
    if (!localFolderMap.has(String(remoteF.id))) {
      cloudOnlyFolders++;
    }
  }

  const totalDiff =
    localOnlyNotes +
    localUpdatedNotes +
    cloudOnlyNotes +
    cloudUpdatedNotes +
    localOnlyFolders +
    cloudOnlyFolders;

  return {
    localOnlyNotes,
    localUpdatedNotes,
    cloudOnlyNotes,
    cloudUpdatedNotes,
    localOnlyFolders,
    cloudOnlyFolders,
    totalDiff,
  };
}

// 4. Perform Two-Way Smart Merge Sync or Full Upload / Pull
export async function pushSyncToCloud(
  config: CloudConfig,
  localNotes: Note[],
  localFolders: Folder[],
  mode: 'merge' | 'push_all' | 'pull_all' = 'merge',
  options?: {
    deletedNoteIds?: string[];
    deletedFolderIds?: string[];
  }
): Promise<{
  success: boolean;
  message: string;
  mergedNotes?: Note[];
  mergedFolders?: Folder[];
  serverTime?: number;
}> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) {
    return { success: false, message: '未配置云端 API 地址' };
  }

  // Special optimization for pull_all: first fetch remote data directly
  if (mode === 'pull_all') {
    const remoteRes = await fetchRemoteData(config);
    if (remoteRes.success && remoteRes.data) {
      return {
        success: true,
        message: '已成功从云端拉取全量最新数据，已覆盖本地！',
        mergedNotes: remoteRes.data.notes,
        mergedFolders: remoteRes.data.folders,
        serverTime: remoteRes.data.serverTime,
      };
    }
  }

  try {
    const urlsToTry = getActionCandidateUrls(baseUrl, 'sync', '/sync');

    const payload = {
      action: mode,
      mode,
      lastSyncedAt: config.lastSyncedAt || 0,
      notes: localNotes,
      folders: localFolders,
      deletedNoteIds: options?.deletedNoteIds || [],
      deletedFolderIds: options?.deletedFolderIds || [],
      timestamp: Date.now(),
    };

    let lastRes: Response | null = null;
    const headers = getHeaders(config);

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          lastRes = res;
          break;
        }
      } catch {}
    }

    if (!lastRes) {
      return { success: false, message: '无法连接到云端同步接口，请检查服务端地址' };
    }

    if (!lastRes.ok) {
      if (lastRes.status === 401 || lastRes.status === 403) {
        return { success: false, message: '认证失败：API Token 无效，请重新配置' };
      }
      return { success: false, message: `同步失败 (HTTP ${lastRes.status})` };
    }

    const result = await lastRes.json().catch(() => null);
    if (!result) {
      return { success: false, message: '服务端返回非有效 JSON 数据' };
    }

    const isSuccess = isResponseSuccessful(result, lastRes.ok);
    if (!isSuccess && !result.data && !result.notes) {
      return { success: false, message: extractResponseMessage(result, '服务端返回同步失败') };
    }

    const data = result.data || result;

    const rawNotesList = Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(result.notes)
      ? result.notes
      : Array.isArray(data.mergedNotes)
      ? data.mergedNotes
      : Array.isArray(result.mergedNotes)
      ? result.mergedNotes
      : null;

    const rawFoldersList = Array.isArray(data.folders)
      ? data.folders
      : Array.isArray(result.folders)
      ? result.folders
      : Array.isArray(data.mergedFolders)
      ? data.mergedFolders
      : Array.isArray(result.mergedFolders)
      ? result.mergedFolders
      : null;

    const mergedNotes: Note[] = rawNotesList ? rawNotesList.map(normalizeRemoteNote) : localNotes;
    const mergedFolders: Folder[] = rawFoldersList ? rawFoldersList.map(normalizeRemoteFolder) : localFolders;

    const successMessage =
      mode === 'push_all'
        ? '本地数据已完全强制覆盖上传至云端服务器！'
        : mode === 'pull_all'
        ? '已成功从云端拉取覆盖本地数据！'
        : extractResponseMessage(result, '云端双向智能同步成功！');

    return {
      success: true,
      message: successMessage,
      mergedNotes,
      mergedFolders,
      serverTime: data.serverTime || result.serverTime || Date.now(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: `网络同步请求失败: ${err.message || '连接错误'}`,
    };
  }
}

// 5. Incremental Sync: Save / Update Single Note
export async function saveSingleNoteToCloud(
  config: CloudConfig,
  note: Note
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(baseUrl, 'upsert_note', '/notes');
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ note, action: 'upsert_note' }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '已增量同步至云端'),
          };
        }
      } catch {}
    }

    return { success: false, message: '单篇笔记同步未成功' };
  } catch (err: any) {
    return { success: false, message: `增量同步失败: ${err.message}` };
  }
}

// 6. Incremental Sync: Delete Single Note
export async function deleteSingleNoteFromCloud(
  config: CloudConfig,
  noteId: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'delete_note',
      `/notes/${encodeURIComponent(noteId)}`
    );
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const fullUrl = url.includes('?')
          ? `${url}&id=${encodeURIComponent(noteId)}`
          : `${url}?id=${encodeURIComponent(noteId)}`;

        const res = await fetch(fullUrl, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ id: noteId, action: 'delete_note' }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端已删除'),
          };
        }
      } catch {}
    }

    return { success: false, message: '云端删除未成功' };
  } catch (err: any) {
    return { success: false, message: `删除同步失败: ${err.message}` };
  }
}

// 6.1. Empty Trash on Cloud (Permanently delete all trash notes on cloud)
export async function emptyTrashOnCloud(
  config: CloudConfig,
  noteIds?: string[]
): Promise<{ success: boolean; message?: string; deletedCount?: number }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'empty_trash',
      '/trash/empty'
    );
    const headers = getHeaders(config);
    const payload = {
      action: 'empty_trash',
      noteIds: noteIds || [],
    };

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端回收站已清空'),
            deletedCount: data?.data?.deletedCount ?? noteIds?.length,
          };
        }
      } catch {}
    }

    // Fallback: If dedicated empty_trash endpoint is not present, delete specified notes individually
    if (noteIds && noteIds.length > 0) {
      let failCount = 0;
      await Promise.all(
        noteIds.map((id) =>
          deleteSingleNoteFromCloud(config, id).catch(() => {
            failCount++;
          })
        )
      );
      if (failCount === 0) {
        return { success: true, message: '云端回收站已成功清空', deletedCount: noteIds.length };
      }
    }

    return { success: false, message: '清空云端回收站接口未响应' };
  } catch (err: any) {
    return { success: false, message: `清空云端回收站失败: ${err.message}` };
  }
}

// 7. Incremental Sync: Save / Update Single Folder
export async function saveSingleFolderToCloud(
  config: CloudConfig,
  folder: Folder
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(baseUrl, 'upsert_folder', '/folders');
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ folder, action: 'upsert_folder' }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '文件夹已同步至云端'),
          };
        }
      } catch {}
    }

    return { success: false, message: '文件夹同步未成功' };
  } catch (err: any) {
    return { success: false, message: `文件夹同步失败: ${err.message}` };
  }
}

// 8. Incremental Sync: Delete Single Folder
export async function deleteSingleFolderFromCloud(
  config: CloudConfig,
  folderId: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = normalizeApiUrl(config.apiUrl);
  if (!baseUrl) return { success: false, message: '未配置 API 地址' };

  try {
    const urls = getActionCandidateUrls(
      baseUrl,
      'delete_folder',
      `/folders/${encodeURIComponent(folderId)}`
    );
    const headers = getHeaders(config);

    for (const url of urls) {
      try {
        const fullUrl = url.includes('?')
          ? `${url}&id=${encodeURIComponent(folderId)}`
          : `${url}?id=${encodeURIComponent(folderId)}`;

        const res = await fetch(fullUrl, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ id: folderId, action: 'delete_folder' }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          return {
            success: isResponseSuccessful(data, true),
            message: extractResponseMessage(data, '云端文件夹已删除'),
          };
        }
      } catch {}
    }

    return { success: false, message: '云端文件夹删除未成功' };
  } catch (err: any) {
    return { success: false, message: `删除文件夹同步失败: ${err.message}` };
  }
}
