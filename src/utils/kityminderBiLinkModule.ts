/**
 * Custom KityMinder Module: BiLinkModule (双向链接内置节点渲染模块)
 * 参照 kityminder 源码中的 NoteModule (备注) 实现模式，
 * 通过扩展 right renderers，将双向链接微章图标直接渲染在思维导图节点内部，
 * 伴随节点排版自适应尺寸与背景轮廓，并支持点击快捷跳转与多链接浮层面板。
 */

import { getNodeLinks } from './mindmapLinks';

export function registerKityMinderBiLinkModule(): boolean {
  const w = window as any;
  if (!w.kity || !w.kityminder || !w.kityminder.Module || !w.kityminder.Module.register) {
    return false;
  }

  // Avoid duplicate registration
  if (w.__kityminderBiLinkModuleRegistered) {
    return true;
  }

  const kity = w.kity;
  const kityminder = w.kityminder;

  // 双向箭头 SVG Path (在 12x10 空间内居中对齐)
  // 上箭头指向右，下箭头指向左
  const arrowPathData = 'M1.5,3.5 h6.5 M6,1.5 l2,2 l-2,2 M8.5,7.5 H2 M4,5.5 l-2,2 l2,2';

  function createBiLinkIcon() {
    const group = new kity.Group();
    group.width = 18;
    group.height = 16;

    // 节点内部微章半透明背景色块 (圆角胶囊状)
    const rect = new kity.Rect(18, 16, 0.5, -8, 3.5)
      .fill('rgba(6, 182, 212, 0.16)')
      .stroke('rgba(8, 145, 178, 0.65)', 1);

    // 双向箭头图标
    const path = new kity.Path()
      .setPathData(arrowPathData)
      .stroke('#0891b2', 1.3)
      .fill('none')
      .setTranslate(4.5, -4.5);

    // 关联多节点数量提示文本 (居中对齐)
    const countText = new kity.Text()
      .setX(17.5)
      .setY(0)
      .setTextAnchor('middle')
      .setVerticalAlign('middle')
      .setFontSize(9)
      .setFontBold(true)
      .fill('#0891b2')
      .setVisible(false);

    if (countText.node) {
      countText.node.setAttribute('text-anchor', 'middle');
      countText.node.setAttribute('dominant-baseline', 'central');
      countText.node.setAttribute('alignment-baseline', 'central');
      countText.node.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      countText.node.style.fontWeight = '700';
      countText.node.style.fontSize = '9px';
      countText.node.style.userSelect = 'none';
    }

    group.addShapes([rect, path, countText]);

    group.on('mouseover', function () {
      rect.fill('rgba(6, 182, 212, 0.32)').stroke('#0e7490', 1.2);
    }).on('mouseout', function () {
      rect.fill('rgba(6, 182, 212, 0.16)').stroke('rgba(8, 145, 178, 0.65)', 1);
    });

    group.setStyle('cursor', 'pointer');

    group.setLinks = function (links: any[], nodeColor?: string) {
      const count = links.length;
      const linkTitles = links.map((l: any) => l.text || '节点').join('、');
      const tooltip = `双向链接 (${count} 个关联节点): ${linkTitles} (点击快捷跳转)`;

      if (rect && rect.node) {
        rect.node.setAttribute('title', tooltip);
      }
      if (path && path.node) {
        path.node.setAttribute('title', tooltip);
      }

      if (count > 1) {
        const isDoubleDigits = count >= 10;
        group.width = isDoubleDigits ? 30 : 24;
        const centerX = isDoubleDigits ? 20.5 : 17.5;

        rect.setWidth(group.width);
        path.setTranslate(2.5, -4.5);
        countText
          .setX(centerX)
          .setY(0)
          .setTextAnchor('middle')
          .setVerticalAlign('middle')
          .setContent(String(count))
          .setVisible(true);

        if (countText.node) {
          countText.node.setAttribute('x', String(centerX));
          countText.node.setAttribute('y', '0');
          countText.node.setAttribute('text-anchor', 'middle');
          countText.node.setAttribute('dominant-baseline', 'central');
          countText.node.setAttribute('alignment-baseline', 'central');
        }
      } else {
        group.width = 18;
        rect.setWidth(18);
        path.setTranslate(4.5, -4.5);
        countText.setVisible(false);
      }

      // Apply theme color accent if white on dark background
      const isWhiteText = nodeColor && (nodeColor.toLowerCase() === '#fff' || nodeColor.toLowerCase() === '#ffffff' || nodeColor.toLowerCase() === 'white');
      if (isWhiteText) {
        rect.fill('rgba(255, 255, 255, 0.25)').stroke('rgba(255, 255, 255, 0.8)', 1);
        path.stroke('#ffffff', 1.3);
        countText.fill('#ffffff');
      } else {
        rect.fill('rgba(6, 182, 212, 0.16)').stroke('rgba(8, 145, 178, 0.65)', 1);
        path.stroke('#0891b2', 1.3);
        countText.fill('#0891b2');
      }
    };

    return group;
  }

  try {
    kityminder.Module.register('BiLinkModule', function () {
      return {
        renderers: {
          right: kity.createClass('BiLinkIconRenderer', {
            base: kityminder.Render,
            create: function (node: any) {
              const icon = createBiLinkIcon();

              icon.on('mousedown', function (e: any) {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
              });

              icon.on('click', function (e: any) {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
                node.getMinder().fire('bilinkclick', { node, icon, event: e });
              });

              icon.on('mouseover', function (e: any) {
                node.getMinder().fire('shownoterequest_bilink', { node, icon, event: e });
              });

              icon.on('mouseout', function (e: any) {
                node.getMinder().fire('hidenoterequest_bilink', { node, icon, event: e });
              });

              return icon;
            },
            shouldRender: function (node: any) {
              const links = getNodeLinks(node);
              return Array.isArray(links) && links.length > 0;
            },
            update: function (icon: any, node: any, box: any) {
              const links = getNodeLinks(node);
              if (!links || links.length === 0) {
                return null;
              }

              const nodeColor = typeof node.getStyle === 'function' ? node.getStyle('color') : '#333';
              icon.setLinks(links, nodeColor);

              const space = (typeof node.getStyle === 'function' ? node.getStyle('space-left') : 4) || 4;
              const d = box.right + space;
              const f = box.cy;
              icon.setTranslate(d, f);

              return new kity.Box(d, Math.round(f - icon.height / 2), icon.width, icon.height);
            }
          })
        }
      };
    });

    w.__kityminderBiLinkModuleRegistered = true;
    return true;
  } catch (err) {
    console.error('Failed to register KityMinder BiLinkModule:', err);
    return false;
  }
}
