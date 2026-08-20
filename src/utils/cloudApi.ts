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
  let trimmed = url.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  return trimmed.replace(/\/+$/, '');
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

    // Build candidate test URLs in order of likelihood
    const candidates: { url: string; method: 'GET' | 'POST' }[] = [];

    if (baseUrl.includes('.php')) {
      const pingUrl = baseUrl.includes('?') ? `${baseUrl}&action=ping` : `${baseUrl}?action=ping`;
      candidates.push({ url: pingUrl, method: 'GET' });
      candidates.push({ url: baseUrl, method: 'POST' });
    } else if (baseUrl.endsWith('/api')) {
      candidates.push({ url: `${baseUrl}/ping`, method: 'GET' });
      candidates.push({ url: `${baseUrl}?action=ping`, method: 'GET' });
      candidates.push({ url: `${baseUrl}/test`, method: 'POST' });
      candidates.push({ url: `${baseUrl}/health`, method: 'GET' });
      candidates.push({ url: baseUrl, method: 'GET' });
    } else if (baseUrl.endsWith('/ping') || baseUrl.endsWith('/test') || baseUrl.endsWith('/health')) {
      candidates.push({ url: baseUrl, method: 'GET' });
      candidates.push({ url: baseUrl, method: 'POST' });
    } else {
      candidates.push({ url: `${baseUrl}/api/ping`, method: 'GET' });
      candidates.push({ url: `${baseUrl}/api.php?action=ping`, method: 'GET' });
      candidates.push({ url: `${baseUrl}/ping`, method: 'GET' });
      candidates.push({ url: `${baseUrl}?action=ping`, method: 'GET' });
      candidates.push({ url: `${baseUrl}/api/test`, method: 'POST' });
      candidates.push({ url: baseUrl, method: 'GET' });
    }

    let lastError = '';
    let matchedRes: Response | null = null;
    const headers = getHeaders(config);

    for (const candidate of candidates) {
      try {
        const fetchOptions: RequestInit = {
          method: candidate.method,
          headers,
          signal: controller.signal,
        };
        if (candidate.method === 'POST') {
          fetchOptions.body = JSON.stringify({ action: 'ping', timestamp: Date.now() });
        }

        const res = await fetch(candidate.url, fetchOptions);

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
          // If server returned a 500 or 400 error, record it
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
    const urlsToTry: string[] = [];
    if (baseUrl.includes('.php')) {
      urlsToTry.push(baseUrl.includes('?') ? `${baseUrl}&action=pull` : `${baseUrl}?action=pull`);
      urlsToTry.push(baseUrl.includes('?') ? `${baseUrl}&action=data` : `${baseUrl}?action=data`);
    } else if (baseUrl.endsWith('/api')) {
      urlsToTry.push(`${baseUrl}/sync?action=pull`);
      urlsToTry.push(`${baseUrl}/data`);
      urlsToTry.push(`${baseUrl}?action=pull`);
    } else {
      urlsToTry.push(`${baseUrl}/api/sync?action=pull`);
      urlsToTry.push(`${baseUrl}/api/data`);
      urlsToTry.push(`${baseUrl}?action=pull`);
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
      return { success: false, message: '无法连接到云端拉取数据接口' };
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
    if (!isSuccess && !json.data && !json.notes) {
      return { success: false, message: extractResponseMessage(json, '服务端返回错误') };
    }

    const resData = json.data || json;
    const rawNotes = Array.isArray(resData.notes) ? resData.notes : (Array.isArray(json.notes) ? json.notes : []);
    const rawFolders = Array.isArray(resData.folders) ? resData.folders : (Array.isArray(json.folders) ? json.folders : []);

    return {
      success: true,
      data: {
        notes: rawNotes,
        folders: rawFolders,
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
  const remoteNoteMap = new Map(remoteNotes.map((n) => [n.id, n]));
  const remoteFolderMap = new Map(remoteFolders.map((f) => [f.id, f]));
  const localNoteMap = new Map(localNotes.map((n) => [n.id, n]));
  const localFolderMap = new Map(localFolders.map((f) => [f.id, f]));

  let localOnlyNotes = 0;
  let localUpdatedNotes = 0;
  let localOnlyFolders = 0;
  let cloudOnlyNotes = 0;
  let cloudUpdatedNotes = 0;
  let cloudOnlyFolders = 0;

  // Compare local notes against remote
  for (const local of localNotes) {
    const remote = remoteNoteMap.get(local.id);
    if (!remote) {
      localOnlyNotes++;
    } else {
      const localTime = parseSafeTime(local.updatedAt || local.createdAt);
      const remoteTime = parseSafeTime(remote.updatedAt || remote.createdAt);

      if (localTime > remoteTime) {
        localUpdatedNotes++;
      } else if (localTime === remoteTime) {
        // If timestamps are identical, check if content or title differs
        const isContentDiff =
          local.title !== remote.title ||
          local.content !== remote.content ||
          local.folderId !== remote.folderId ||
          local.isStarred !== remote.isStarred ||
          local.isFavorite !== remote.isFavorite ||
          local.isDeleted !== remote.isDeleted ||
          local.format !== remote.format;
        if (isContentDiff) {
          localUpdatedNotes++;
        }
      }
    }
  }

  // Compare remote notes against local (for cloud-newer items)
  for (const remote of remoteNotes) {
    const local = localNoteMap.get(remote.id);
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
  for (const localF of localFolders) {
    if (!remoteFolderMap.has(localF.id)) {
      localOnlyFolders++;
    }
  }

  for (const remoteF of remoteFolders) {
    if (!localFolderMap.has(remoteF.id)) {
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

// 4. Perform Two-Way Smart Merge Sync
export async function pushSyncToCloud(
  config: CloudConfig,
  localNotes: Note[],
  localFolders: Folder[],
  mode: 'merge' | 'push_all' | 'pull_all' = 'merge'
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

  try {
    const urlsToTry: string[] = [];
    if (baseUrl.includes('.php')) {
      urlsToTry.push(baseUrl.includes('?') ? `${baseUrl}&action=sync` : `${baseUrl}?action=sync`);
    } else if (baseUrl.endsWith('/api')) {
      urlsToTry.push(`${baseUrl}/sync`);
      urlsToTry.push(`${baseUrl}?action=sync`);
    } else {
      urlsToTry.push(`${baseUrl}/api/sync`);
      urlsToTry.push(`${baseUrl}/sync`);
      urlsToTry.push(`${baseUrl}?action=sync`);
    }

    const payload = {
      action: mode,
      lastSyncedAt: config.lastSyncedAt || 0,
      notes: localNotes,
      folders: localFolders,
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
      return { success: false, message: '无法连接到云端同步接口' };
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
    const mergedNotes: Note[] = Array.isArray(data.notes) ? data.notes : (Array.isArray(result.notes) ? result.notes : localNotes);
    const mergedFolders: Folder[] = Array.isArray(data.folders) ? data.folders : (Array.isArray(result.folders) ? result.folders : localFolders);

    return {
      success: true,
      message: extractResponseMessage(result, '云端同步成功！'),
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
    const url = baseUrl.includes('.php')
      ? `${baseUrl}?action=upsert_note`
      : `${baseUrl}/notes`;

    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(config),
      body: JSON.stringify({ note }),
    });

    if (!res.ok) {
      return { success: false, message: `单篇笔记同步失败 (HTTP ${res.status})` };
    }

    const data = await res.json().catch(() => null);
    const isSuccess = isResponseSuccessful(data, res.ok);
    return {
      success: isSuccess,
      message: extractResponseMessage(data, '已同步至云端'),
    };
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
    const url = baseUrl.includes('.php')
      ? `${baseUrl}?action=delete_note&id=${encodeURIComponent(noteId)}`
      : `${baseUrl}/notes/${encodeURIComponent(noteId)}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders(config),
      body: JSON.stringify({ id: noteId }),
    });

    if (!res.ok) {
      return { success: false, message: `云端删除失败 (HTTP ${res.status})` };
    }

    const data = await res.json().catch(() => null);
    const isSuccess = isResponseSuccessful(data, res.ok);
    return {
      success: isSuccess,
      message: extractResponseMessage(data, '云端已删除'),
    };
  } catch (err: any) {
    return { success: false, message: `删除同步失败: ${err.message}` };
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
    const url = baseUrl.includes('.php')
      ? `${baseUrl}?action=upsert_folder`
      : `${baseUrl}/folders`;

    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(config),
      body: JSON.stringify({ folder }),
    });

    if (!res.ok) {
      return { success: false, message: `文件夹同步失败 (HTTP ${res.status})` };
    }

    const data = await res.json().catch(() => null);
    const isSuccess = isResponseSuccessful(data, res.ok);
    return {
      success: isSuccess,
      message: extractResponseMessage(data, '文件夹已同步至云端'),
    };
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
    const url = baseUrl.includes('.php')
      ? `${baseUrl}?action=delete_folder&id=${encodeURIComponent(folderId)}`
      : `${baseUrl}/folders/${encodeURIComponent(folderId)}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders(config),
      body: JSON.stringify({ id: folderId }),
    });

    if (!res.ok) {
      return { success: false, message: `云端删除文件夹失败 (HTTP ${res.status})` };
    }

    const data = await res.json().catch(() => null);
    const isSuccess = isResponseSuccessful(data, res.ok);
    return {
      success: isSuccess,
      message: extractResponseMessage(data, '云端文件夹已删除'),
    };
  } catch (err: any) {
    return { success: false, message: `删除文件夹同步失败: ${err.message}` };
  }
}


