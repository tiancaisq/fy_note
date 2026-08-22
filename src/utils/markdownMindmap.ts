export interface MindMapNodeData {
  text: string;
  note?: string;
  hyperlink?: string;
  hyperlinkTitle?: string;
  priority?: number;
  progress?: number;
  expandState?: 'expand' | 'collapse';
  id?: string;
  links?: Array<{ id: string; text?: string }>;
}

export interface MindMapTreeNode {
  data: MindMapNodeData;
  children: MindMapTreeNode[];
}

export interface MindMapRootJson {
  root: MindMapTreeNode;
  theme?: string;
  template?: string;
}

/**
 * Convert a KityMinder JSON tree into clean, readable hierarchical Markdown
 */
export function mindmapToMarkdown(mindmapJson: MindMapRootJson | { root: any }): string {
  if (!mindmapJson || !mindmapJson.root) {
    return '# 中心主题\n';
  }

  const lines: string[] = [];

  function stringifyNode(node: MindMapTreeNode, depth: number) {
    const data = node.data || { text: '未命名节点' };
    let text = data.text || '未命名节点';

    // If node has hyperlink, format as markdown link if not already formatted
    if (data.hyperlink && !text.includes('](')) {
      text = `[${text}](${data.hyperlink})`;
    }

    // Append Priority tag if present
    if (data.priority) {
      text += ` [P${data.priority}]`;
    }

    // Append Progress tag if present
    if (data.progress) {
      const pct = Math.round((data.progress / 8) * 100);
      text += ` [${pct}%]`;
    }

    // Format indentation or headings based on depth
    if (depth === 0) {
      lines.push(`# ${text}`);
    } else if (depth === 1) {
      lines.push(`\n## ${text}`);
    } else if (depth === 2) {
      lines.push(`### ${text}`);
    } else {
      const indent = '  '.repeat(depth - 1);
      lines.push(`${indent}- ${text}`);
    }

    // Append Note if present
    if (data.note && data.note.trim()) {
      const noteIndent = depth <= 2 ? '' : '  '.repeat(depth - 1);
      const noteLines = data.note.trim().split('\n');
      for (const nl of noteLines) {
        lines.push(`${noteIndent}> ${nl}`);
      }
    }

    // Process children
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        stringifyNode(child, depth + 1);
      }
    }
  }

  stringifyNode(mindmapJson.root, 0);
  return lines.join('\n').trim() + '\n';
}

/**
 * Parse Markdown text (Headings, Bullet Lists, Notes, Priorities, Links) into KityMinder JSON tree
 */
export function markdownToMindmap(markdownText: string): MindMapRootJson {
  const rawLines = markdownText.split(/\r?\n/);

  interface IntermediateItem {
    level: number;
    text: string;
    note?: string;
    priority?: number;
    progress?: number;
    hyperlink?: string;
    hyperlinkTitle?: string;
  }

  const items: IntermediateItem[] = [];
  let currentItem: IntermediateItem | null = null;

  for (let line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for note line (> note content)
    if (trimmed.startsWith('>')) {
      const noteText = trimmed.replace(/^>\s*/, '');
      if (currentItem) {
        if (currentItem.note) {
          currentItem.note += '\n' + noteText;
        } else {
          currentItem.note = noteText;
        }
      }
      continue;
    }

    // Check for Markdown Headings (# H1, ## H2, ### H3...)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length - 1; // # -> 0, ## -> 1, ### -> 2...
      const content = headingMatch[2];
      currentItem = parseLineContent(content, level);
      items.push(currentItem);
      continue;
    }

    // Check for list items (- item, * item, + item, 1. item)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const indentSpaces = listMatch[1].replace(/\t/g, '  ').length;
      // Calculate level from indentation: 0 space = level 1, 2 spaces = level 2, 4 spaces = level 3...
      const level = Math.floor(indentSpaces / 2) + 1;
      const content = listMatch[3];
      currentItem = parseLineContent(content, level);
      items.push(currentItem);
      continue;
    }

    // Fallback normal line text
    if (currentItem) {
      // Append as extra note line if it's dangling text
      if (currentItem.note) {
        currentItem.note += '\n' + trimmed;
      } else {
        currentItem.note = trimmed;
      }
    } else {
      // First line without markdown prefix becomes root
      currentItem = parseLineContent(trimmed, 0);
      items.push(currentItem);
    }
  }

  if (items.length === 0) {
    return {
      root: {
        data: { text: '中心主题', expandState: 'expand' },
        children: []
      }
    };
  }

  // Ensure root item is at level 0
  if (items[0].level !== 0) {
    items[0].level = 0;
  }

  // Build tree from flat items with levels
  const rootNode: MindMapTreeNode = {
    data: {
      text: items[0].text,
      note: items[0].note,
      priority: items[0].priority,
      progress: items[0].progress,
      hyperlink: items[0].hyperlink,
      expandState: 'expand',
      id: 'node_' + Math.random().toString(36).substring(2, 9)
    },
    children: []
  };

  const stack: { level: number; node: MindMapTreeNode }[] = [
    { level: 0, node: rootNode }
  ];

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const node: MindMapTreeNode = {
      data: {
        text: item.text,
        note: item.note,
        priority: item.priority,
        progress: item.progress,
        hyperlink: item.hyperlink,
        id: 'node_' + Math.random().toString(36).substring(2, 9)
      },
      children: []
    };

    // Pop items from stack with level >= current item level
    while (stack.length > 1 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    parent.children.push(node);
    stack.push({ level: item.level, node });
  }

  return { root: rootNode };
}

function parseLineContent(rawContent: string, level: number) {
  let text = rawContent.trim();
  let priority: number | undefined = undefined;
  let progress: number | undefined = undefined;
  let hyperlink: string | undefined = undefined;

  // Extract Priority tag: [P1] ~ [P9] or P1 ~ P9
  const priorityMatch = text.match(/\[P([1-9])\]/i) || text.match(/\(P([1-9])\)/i);
  if (priorityMatch) {
    priority = parseInt(priorityMatch[1], 10);
    text = text.replace(priorityMatch[0], '').trim();
  }

  // Extract Progress percentage: [100%], [50%], [25%] or (80%)
  const progressMatch = text.match(/\[(\d{1,3})%\]/) || text.match(/\((\d{1,3})%\)/);
  if (progressMatch) {
    const pct = parseInt(progressMatch[1], 10);
    // Convert 0-100% to KityMinder progress 1-8
    progress = Math.max(1, Math.min(8, Math.round((pct / 100) * 8)));
    text = text.replace(progressMatch[0], '').trim();
  }

  // Extract Markdown Link: [Link text](https://url)
  const linkMatch = text.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  if (linkMatch) {
    text = linkMatch[1];
    hyperlink = linkMatch[2];
  } else {
    // Bare URL: <https://url>
    const bareUrlMatch = text.match(/<(https?:\/\/[^\s>]+)>/);
    if (bareUrlMatch) {
      hyperlink = bareUrlMatch[1];
      text = text.replace(bareUrlMatch[0], '').trim() || hyperlink;
    }
  }

  return {
    level,
    text: text || '分支主题',
    priority,
    progress,
    hyperlink
  };
}
