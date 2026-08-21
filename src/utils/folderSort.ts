import { Folder } from '../types';

/**
 * 稳定排序同级文件夹比较函数：
 * 优先按 order 升序比较；若 order 相同，则按文件夹名称进行中文拼音比较；若仍相同则按 id 比较，确保 100% 确定性。
 */
export function compareFolders(a: Folder, b: Folder): number {
  const orderA = typeof a.order === 'number' && !isNaN(a.order) ? a.order : 0;
  const orderB = typeof b.order === 'number' && !isNaN(b.order) ? b.order : 0;
  
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  
  const nameA = a.name || '';
  const nameB = b.name || '';
  const nameComp = nameA.localeCompare(nameB, 'zh-CN');
  if (nameComp !== 0) {
    return nameComp;
  }
  
  return (a.id || '').localeCompare(b.id || '');
}

/**
 * 全量规范化所有层级文件夹的 order。
 * 对每个 parentId (包括 null 根级) 分组下的所有兄弟文件夹进行稳定排序，并严格重赋连续的 1-based order (1, 2, 3...)。
 */
export function normalizeFolderOrders(foldersList: Folder[]): Folder[] {
  if (!Array.isArray(foldersList) || foldersList.length === 0) {
    return foldersList;
  }

  const validFolderIds = new Set(foldersList.map((f) => f.id));
  const firstRootFolderId = foldersList.find((f) => !f.parentId)?.id || foldersList[0]?.id || '';

  // 按 parentId 分组
  const groupMap = new Map<string | null, Folder[]>();

  for (const folder of foldersList) {
    let pId = folder.parentId || null;
    // 如果父目录 ID 无效且不是首个目录，则将其归到首个目录下
    if (pId && !validFolderIds.has(pId) && folder.id !== firstRootFolderId) {
      pId = firstRootFolderId;
      folder.parentId = firstRootFolderId;
    }

    if (!groupMap.has(pId)) {
      groupMap.set(pId, []);
    }
    groupMap.get(pId)!.push(folder);
  }

  // 对每个分组分别进行稳定排序，并重置 order 序列
  for (const [, siblings] of groupMap.entries()) {
    siblings.sort(compareFolders);
    siblings.forEach((folder, index) => {
      folder.order = index + 1;
    });
  }

  return foldersList;
}

/**
 * 拖拽移动目录或调整同级/跨级目录顺序，并自动重新计算所有受影响目录及整棵树的 order。
 */
export function reorderFolder(
  foldersList: Folder[],
  draggedFolderId: string,
  targetParentId: string | null,
  position: 'inside' | 'before' | 'after' = 'inside',
  targetFolderId?: string
): { success: boolean; message?: string; affectedFolderIds: string[] } {
  if (draggedFolderId === targetFolderId && position !== 'inside') {
    return { success: false, affectedFolderIds: [] };
  }
  if (draggedFolderId === targetParentId && position === 'inside') {
    return { success: false, affectedFolderIds: [] };
  }

  const draggedFolder = foldersList.find((f) => f.id === draggedFolderId);
  if (!draggedFolder) {
    return { success: false, affectedFolderIds: [] };
  }

  // 记录移动前所有目录的 order 和 parentId，用于精确比对受影响的目录
  const previousState = new Map<string, { order: number; parentId: string | null }>();
  foldersList.forEach((f) => {
    previousState.set(f.id, {
      order: typeof f.order === 'number' ? f.order : 0,
      parentId: f.parentId || null,
    });
  });

  // 获取该目录的所有子孙目录 ID（防止移动到自己或自己的子目录下造成循环引用）
  function getDescendantIds(parentId: string): string[] {
    const direct = foldersList.filter((f) => (f.parentId || null) === parentId);
    let ids: string[] = direct.map((f) => f.id);
    for (const d of direct) {
      ids = ids.concat(getDescendantIds(d.id));
    }
    return ids;
  }

  const descendants = getDescendantIds(draggedFolderId);
  if (targetParentId && (descendants.includes(targetParentId) || targetParentId === draggedFolderId)) {
    return { success: false, message: '不能将文件夹移动至其自身的子文件夹中', affectedFolderIds: [] };
  }
  if (targetFolderId && (descendants.includes(targetFolderId) || targetFolderId === draggedFolderId)) {
    return { success: false, message: '不能将文件夹移动至其自身的子文件夹中', affectedFolderIds: [] };
  }

  const oldParentId = draggedFolder.parentId || null;
  let newParentId: string | null = targetParentId || null;

  if (position === 'inside') {
    newParentId = targetParentId || null;
    draggedFolder.parentId = newParentId;

    // 获取目标同级已有兄弟节点并稳定排序
    const siblings = foldersList
      .filter((f) => f.id !== draggedFolderId && (f.parentId || null) === newParentId)
      .sort(compareFolders);

    siblings.push(draggedFolder);
    siblings.forEach((f, idx) => {
      f.order = idx + 1;
    });
  } else if (targetFolderId && (position === 'before' || position === 'after')) {
    const targetFolder = foldersList.find((f) => f.id === targetFolderId);
    if (!targetFolder) {
      return { success: false, affectedFolderIds: [] };
    }

    newParentId = targetFolder.parentId || null;
    draggedFolder.parentId = newParentId;

    // 获取目标同级已有兄弟节点并稳定排序
    const siblings = foldersList
      .filter((f) => f.id !== draggedFolderId && (f.parentId || null) === newParentId)
      .sort(compareFolders);

    const targetIndex = siblings.findIndex((f) => f.id === targetFolderId);
    if (targetIndex === -1) {
      siblings.push(draggedFolder);
    } else {
      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
      siblings.splice(insertIndex, 0, draggedFolder);
    }

    // 重新计算并赋予绝对连续的 order
    siblings.forEach((f, idx) => {
      f.order = idx + 1;
    });
  }

  // 如果原父级发生了改变，也对原父级的剩余同级兄弟重新计算 order
  if (oldParentId !== newParentId) {
    const oldSiblings = foldersList
      .filter((f) => f.id !== draggedFolderId && (f.parentId || null) === oldParentId)
      .sort(compareFolders);
    oldSiblings.forEach((f, idx) => {
      f.order = idx + 1;
    });
  }

  // 全量规范化，确保所有同级 order 均从 1 连续递增且无重复
  normalizeFolderOrders(foldersList);

  // 收集所有 order 或 parentId 发生变更的目录 ID 以及目标/原分组的所有同级兄弟目录 ID
  const affectedSet = new Set<string>();
  affectedSet.add(draggedFolderId);

  // 目标同级与原同级所有兄弟均标记为受影响，确保同步到远端后顺序绝对一致
  foldersList.forEach((f) => {
    const currentParent = f.parentId || null;
    if (currentParent === newParentId || currentParent === oldParentId) {
      affectedSet.add(f.id);
    }
    const prev = previousState.get(f.id);
    if (prev && (prev.order !== f.order || prev.parentId !== (f.parentId || null))) {
      affectedSet.add(f.id);
    }
  });

  return {
    success: true,
    affectedFolderIds: Array.from(affectedSet),
  };
}
