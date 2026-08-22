/**
 * Bidirectional Link Utilities for KityMinder Mind Maps
 */

export interface MindMapLinkItem {
  id: string; // Target node stable ID
  text?: string; // Snapshot of target node text
}

export interface LinkableNodeInfo {
  id: string;
  node: any;
  text: string;
  path: string[];
  level: number;
  isAlreadyLinked: boolean;
  isSelf: boolean;
}

/**
 * Get or generate a stable persistent ID for a KityMinder node
 */
export function getNodeStableId(node: any): string {
  if (!node) return '';
  try {
    if (typeof node.getData === 'function') {
      let id = node.getData('id');
      if (!id) {
        id = 'node_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
        node.setData('id', id);
      }
      return id;
    }
    if (node.data && typeof node.data === 'object') {
      if (!node.data.id) {
        node.data.id = 'node_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      }
      return node.data.id;
    }
  } catch {}
  return 'node_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Retrieve node text
 */
export function getNodeText(node: any): string {
  if (!node) return '';
  try {
    if (typeof node.getText === 'function') {
      const t = node.getText();
      if (t) return t;
    }
    if (typeof node.getData === 'function') {
      const t = node.getData('text');
      if (t) return t;
    }
    if (node.data && node.data.text) {
      return node.data.text;
    }
  } catch {}
  return '未命名主题';
}

/**
 * Retrieve ancestor path string array for a node
 */
export function getNodePath(node: any): string[] {
  const path: string[] = [];
  if (!node) return path;
  let p = node.parent || (typeof node.getParent === 'function' ? node.getParent() : null);
  while (p) {
    path.unshift(getNodeText(p));
    p = p.parent || (typeof p.getParent === 'function' ? p.getParent() : null);
  }
  return path;
}

/**
 * Get normalized array of bidirectional links from a node
 */
export function getNodeLinks(node: any): MindMapLinkItem[] {
  if (!node) return [];
  try {
    let rawLinks: any = null;
    if (typeof node.getData === 'function') {
      rawLinks = node.getData('links');
    } else if (node.data) {
      rawLinks = node.data.links;
    }

    if (!rawLinks) return [];

    if (Array.isArray(rawLinks)) {
      const results: MindMapLinkItem[] = [];
      for (const item of rawLinks) {
        if (typeof item === 'string' && item.trim()) {
          results.push({ id: item.trim(), text: '' });
        } else if (item && typeof item === 'object' && item.id) {
          results.push({ id: String(item.id), text: item.text || '' });
        }
      }
      return results;
    }
  } catch {}
  return [];
}

/**
 * Set links on a node and ensure proper data persistence
 */
export function setNodeLinks(node: any, links: MindMapLinkItem[]): void {
  if (!node) return;
  const cleanLinks = links
    .filter(l => l && l.id)
    .map(l => ({ id: String(l.id), text: l.text || '' }));

  try {
    if (typeof node.setData === 'function') {
      if (cleanLinks.length > 0) {
        node.setData('links', cleanLinks);
      } else {
        node.setData('links', undefined);
      }
    } else if (node.data) {
      if (cleanLinks.length > 0) {
        node.data.links = cleanLinks;
      } else {
        delete node.data.links;
      }
    }
  } catch {}
}

/**
 * Find a node in the minder tree by stable ID
 */
export function findNodeById(rootNode: any, targetId: string): any | null {
  if (!rootNode || !targetId) return null;
  let found: any = null;

  function traverse(cur: any) {
    if (found || !cur) return;
    const curId = getNodeStableId(cur);
    if (curId === targetId) {
      found = cur;
      return;
    }
    const children = cur.getChildren ? cur.getChildren() : (cur.children || []);
    for (const child of children) {
      traverse(child);
    }
  }

  traverse(rootNode);
  return found;
}

/**
 * Add an automatic bidirectional link between sourceNode and targetNode
 */
export function addBidirectionalLink(sourceNode: any, targetNode: any): boolean {
  if (!sourceNode || !targetNode) return false;
  const sourceId = getNodeStableId(sourceNode);
  const targetId = getNodeStableId(targetNode);
  if (!sourceId || !targetId || sourceId === targetId) return false;

  const sourceText = getNodeText(sourceNode);
  const targetText = getNodeText(targetNode);

  // 1. Update sourceNode links -> add targetNode
  const sourceLinks = getNodeLinks(sourceNode);
  if (!sourceLinks.some(l => l.id === targetId)) {
    sourceLinks.push({ id: targetId, text: targetText });
    setNodeLinks(sourceNode, sourceLinks);
  }

  // 2. Automatically update targetNode links -> add sourceNode (Automatic Bidirectional Link)
  const targetLinks = getNodeLinks(targetNode);
  if (!targetLinks.some(l => l.id === sourceId)) {
    targetLinks.push({ id: sourceId, text: sourceText });
    setNodeLinks(targetNode, targetLinks);
  }

  return true;
}

/**
 * Remove an automatic bidirectional link between sourceNode and targetNode
 */
export function removeBidirectionalLink(sourceNode: any, targetNode: any): boolean {
  if (!sourceNode || !targetNode) return false;
  const sourceId = getNodeStableId(sourceNode);
  const targetId = getNodeStableId(targetNode);
  if (!sourceId || !targetId) return false;

  // 1. Remove target from sourceNode
  const sourceLinks = getNodeLinks(sourceNode).filter(l => l.id !== targetId);
  setNodeLinks(sourceNode, sourceLinks);

  // 2. Remove source from targetNode
  const targetLinks = getNodeLinks(targetNode).filter(l => l.id !== sourceId);
  setNodeLinks(targetNode, targetLinks);

  return true;
}

/**
 * Clean up dangling links across the entire tree if target nodes were deleted
 */
export function cleanDanglingLinks(rootNode: any): number {
  if (!rootNode) return 0;
  const allExistingIds = new Set<string>();

  function collectIds(cur: any) {
    if (!cur) return;
    allExistingIds.add(getNodeStableId(cur));
    const children = cur.getChildren ? cur.getChildren() : (cur.children || []);
    for (const child of children) {
      collectIds(child);
    }
  }

  collectIds(rootNode);

  let cleanedCount = 0;

  function prune(cur: any) {
    if (!cur) return;
    const links = getNodeLinks(cur);
    if (links.length > 0) {
      const validLinks = links.filter(l => allExistingIds.has(l.id));
      if (validLinks.length !== links.length) {
        cleanedCount += (links.length - validLinks.length);
        setNodeLinks(cur, validLinks);
      }
    }
    const children = cur.getChildren ? cur.getChildren() : (cur.children || []);
    for (const child of children) {
      prune(child);
    }
  }

  prune(rootNode);
  return cleanedCount;
}

/**
 * Get a flat list of all nodes in the tree for selection in link modal
 */
export function getAllLinkableNodes(rootNode: any, currentNodeId: string): LinkableNodeInfo[] {
  if (!rootNode) return [];
  const results: LinkableNodeInfo[] = [];
  const currentNode = findNodeById(rootNode, currentNodeId);
  const currentLinkedIds = new Set(currentNode ? getNodeLinks(currentNode).map(l => l.id) : []);

  function traverse(node: any) {
    if (!node) return;
    const id = getNodeStableId(node);
    const text = getNodeText(node);
    const path = getNodePath(node);
    const level = typeof node.getLevel === 'function' ? node.getLevel() : 0;
    const isSelf = id === currentNodeId;
    const isAlreadyLinked = currentLinkedIds.has(id);

    results.push({
      id,
      node,
      text,
      path,
      level,
      isAlreadyLinked,
      isSelf
    });

    const children = node.getChildren ? node.getChildren() : (node.children || []);
    for (const child of children) {
      traverse(child);
    }
  }

  traverse(rootNode);
  return results;
}
