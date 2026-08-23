/**
 * Draw.io Diagram Templates & XML Utilities
 * Reference: https://github.com/jgraph/drawio
 */

export interface DrawioTemplateInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  xml: string;
}

// 1. Basic Flowchart Template
const FLOWCHART_XML = `<mxfile host="app.diagrams.net" modified="2025-01-01T00:00:00.000Z" agent="Fengye Notes Draw.io" version="24.0.0" type="device">
  <diagram name="Page-1" id="flowchart-page-1">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="start_node" value="开始 / Start" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="340" y="60" width="120" height="50" as="geometry" />
        </mxCell>
        <mxCell id="step1_node" value="初始化系统环境配置与加载参数" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="310" y="150" width="180" height="60" as="geometry" />
        </mxCell>
        <mxCell id="decision_node" value="是否通过校验？" style="rhombus;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=12;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="320" y="250" width="160" height="80" as="geometry" />
        </mxCell>
        <mxCell id="process_ok" value="执行业务核心逻辑处理" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="310" y="370" width="180" height="60" as="geometry" />
        </mxCell>
        <mxCell id="process_err" value="记录错误日志并触发告警通知" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="540" y="260" width="160" height="60" as="geometry" />
        </mxCell>
        <mxCell id="end_node" value="结束 / Finish" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="340" y="470" width="120" height="50" as="geometry" />
        </mxCell>
        <mxCell id="e1" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="start_node" target="step1_node">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e2" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="step1_node" target="decision_node">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e3" value="是 (Yes)" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="decision_node" target="process_ok">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e4" value="否 (No)" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;labelBackgroundColor=#ffffff;" edge="1" parent="1" source="decision_node" target="process_err">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e5" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="process_ok" target="end_node">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e6" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="process_err" target="end_node">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="620" y="495" />
            </Array>
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

// 2. Cloud Software Architecture Template
const ARCHITECTURE_XML = `<mxfile host="app.diagrams.net" modified="2025-01-01T00:00:00.000Z" agent="Fengye Notes Draw.io" version="24.0.0" type="device">
  <diagram name="Architecture" id="arch-page-1">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- Client Tier -->
        <mxCell id="c_box" value="客户端访问层 (Client Apps)" style="swimlane;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;fontStyle=1;startSize=26;" vertex="1" parent="1">
          <mxGeometry x="60" y="60" width="180" height="240" as="geometry" />
        </mxCell>
        <mxCell id="web_app" value="💻 Web SPA 网页端 (Vue 3 + Vite)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="c_box">
          <mxGeometry x="15" y="45" width="150" height="45" as="geometry" />
        </mxCell>
        <mxCell id="mobile_app" value="📱 iOS / Android 移动端" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="c_box">
          <mxGeometry x="15" y="105" width="150" height="45" as="geometry" />
        </mxCell>
        <mxCell id="desktop_app" value="🖥️ 桌面客户端 (Electron)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="c_box">
          <mxGeometry x="15" y="165" width="150" height="45" as="geometry" />
        </mxCell>
        <!-- Gateway Tier -->
        <mxCell id="gw_box" value="网关与负载均衡" style="swimlane;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;fontStyle=1;startSize=26;" vertex="1" parent="1">
          <mxGeometry x="290" y="60" width="170" height="240" as="geometry" />
        </mxCell>
        <mxCell id="nginx_gw" value="🛡️ Nginx 统一反向代理" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="gw_box">
          <mxGeometry x="15" y="60" width="140" height="50" as="geometry" />
        </mxCell>
        <mxCell id="auth_gw" value="🔑 JWT 鉴权与限流" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="gw_box">
          <mxGeometry x="15" y="135" width="140" height="50" as="geometry" />
        </mxCell>
        <!-- Microservices Tier -->
        <mxCell id="svc_box" value="微服务集群 (Microservices)" style="swimlane;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;fontStyle=1;startSize=26;" vertex="1" parent="1">
          <mxGeometry x="510" y="60" width="190" height="240" as="geometry" />
        </mxCell>
        <mxCell id="note_svc" value="📝 笔记与知识库服务" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="svc_box">
          <mxGeometry x="15" y="45" width="160" height="40" as="geometry" />
        </mxCell>
        <mxCell id="sync_svc" value="🔄 云端数据实时同步服务" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="svc_box">
          <mxGeometry x="15" y="95" width="160" height="40" as="geometry" />
        </mxCell>
        <mxCell id="diagram_svc" value="🎨 Draw.io 图表渲染服务" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="svc_box">
          <mxGeometry x="15" y="145" width="160" height="40" as="geometry" />
        </mxCell>
        <mxCell id="ai_svc" value="✨ Gemini AI 智能助手" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="svc_box">
          <mxGeometry x="15" y="190" width="160" height="40" as="geometry" />
        </mxCell>
        <!-- Storage Tier -->
        <mxCell id="db_box" value="数据持久化层 (Storage &amp; Cache)" style="swimlane;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;fontStyle=1;startSize=26;" vertex="1" parent="1">
          <mxGeometry x="240" y="340" width="460" height="130" as="geometry" />
        </mxCell>
        <mxCell id="db_main" value="🗄️ PostgreSQL / MySQL&#xa;结构化数据存储" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="db_box">
          <mxGeometry x="30" y="40" width="140" height="70" as="geometry" />
        </mxCell>
        <mxCell id="redis_cache" value="⚡ Redis 内存缓存&#xa;会话与热点数据" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="db_box">
          <mxGeometry x="190" y="40" width="120" height="70" as="geometry" />
        </mxCell>
        <mxCell id="oss_storage" value="📦 对象存储 S3 / OSS&#xa;图表图片与附件" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="db_box">
          <mxGeometry x="325" y="40" width="120" height="70" as="geometry" />
        </mxCell>
        <!-- Connectors -->
        <mxCell id="e_c_gw" value="HTTPS" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="c_box" target="gw_box">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e_gw_svc" value="RPC / gRPC" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="gw_box" target="svc_box">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="e_svc_db" value="连接池" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="svc_box" target="db_box">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

// 3. Entity Relationship Diagram (ERD) Template
const ERD_XML = `<mxfile host="app.diagrams.net" modified="2025-01-01T00:00:00.000Z" agent="Fengye Notes Draw.io" version="24.0.0" type="device">
  <diagram name="ERD" id="erd-page-1">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- Table: Users -->
        <mxCell id="tbl_users" value="users (用户表)" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="80" y="80" width="190" height="150" as="geometry" />
        </mxCell>
        <mxCell id="u_col1" value="🔑 id: VARCHAR(36) [PK]" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontStyle=1" vertex="1" parent="tbl_users">
          <mxGeometry y="26" width="190" height="26" as="geometry" />
        </mxCell>
        <mxCell id="u_col2" value="👤 username: VARCHAR(50)" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_users">
          <mxGeometry y="52" width="190" height="24" as="geometry" />
        </mxCell>
        <mxCell id="u_col3" value="📧 email: VARCHAR(100)" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_users">
          <mxGeometry y="76" width="190" height="24" as="geometry" />
        </mxCell>
        <mxCell id="u_col4" value="🕒 created_at: TIMESTAMP" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_users">
          <mxGeometry y="100" width="190" height="24" as="geometry" />
        </mxCell>
        <!-- Table: Notes -->
        <mxCell id="tbl_notes" value="notes (笔记/图表表)" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="360" y="80" width="220" height="190" as="geometry" />
        </mxCell>
        <mxCell id="n_col1" value="🔑 id: VARCHAR(36) [PK]" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontStyle=1" vertex="1" parent="tbl_notes">
          <mxGeometry y="26" width="220" height="26" as="geometry" />
        </mxCell>
        <mxCell id="n_col2" value="📁 folder_id: VARCHAR(36) [FK]" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontStyle=2" vertex="1" parent="tbl_notes">
          <mxGeometry y="52" width="220" height="24" as="geometry" />
        </mxCell>
        <mxCell id="n_col3" value="🏷️ title: VARCHAR(255)" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_notes">
          <mxGeometry y="76" width="220" height="24" as="geometry" />
        </mxCell>
        <mxCell id="n_col4" value="📝 content: LONGTEXT (XML/MD)" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_notes">
          <mxGeometry y="100" width="220" height="24" as="geometry" />
        </mxCell>
        <mxCell id="n_col5" value="🎨 format: VARCHAR(20) [drawio]" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_notes">
          <mxGeometry y="124" width="220" height="24" as="geometry" />
        </mxCell>
        <!-- Table: Folders -->
        <mxCell id="tbl_folders" value="folders (文件夹表)" style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1">
          <mxGeometry x="360" y="320" width="220" height="130" as="geometry" />
        </mxCell>
        <mxCell id="f_col1" value="🔑 id: VARCHAR(36) [PK]" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontStyle=1" vertex="1" parent="tbl_folders">
          <mxGeometry y="26" width="220" height="26" as="geometry" />
        </mxCell>
        <mxCell id="f_col2" value="📁 parent_id: VARCHAR(36) [FK]" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_folders">
          <mxGeometry y="52" width="220" height="24" as="geometry" />
        </mxCell>
        <mxCell id="f_col3" value="🏷️ name: VARCHAR(100)" style="text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="tbl_folders">
          <mxGeometry y="76" width="220" height="24" as="geometry" />
        </mxCell>
        <!-- Relation 1:N -->
        <mxCell id="rel1" value="1 : N 拥有笔记" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="tbl_users" target="tbl_notes">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="rel2" value="1 : N 包含笔记" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;endArrow=ERmany;startArrow=ERone;" edge="1" parent="1" source="tbl_folders" target="tbl_notes">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

// 4. UML Sequence Diagram Template
const SEQUENCE_XML = `<mxfile host="app.diagrams.net" modified="2025-01-01T00:00:00.000Z" agent="Fengye Notes Draw.io" version="24.0.0" type="device">
  <diagram name="Sequence" id="seq-page-1">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- Lifelines -->
        <mxCell id="actor_user" value="用户 (User)" style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="100" y="80" width="100" height="360" as="geometry" />
        </mxCell>
        <mxCell id="actor_client" value="前端 (Client SPA)" style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="270" y="80" width="110" height="360" as="geometry" />
        </mxCell>
        <mxCell id="actor_drawio" value="Draw.io 引擎" style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;fillColor=#ffe6cc;strokeColor=#d79b00;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="450" y="80" width="110" height="360" as="geometry" />
        </mxCell>
        <mxCell id="actor_server" value="后端存储 (Cloud API)" style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;fillColor=#e1d5e7;strokeColor=#9673a6;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="630" y="80" width="120" height="360" as="geometry" />
        </mxCell>
        <!-- Sequence steps -->
        <mxCell id="m1" value="1. 点击新建/打开图表" style="html=1;verticalAlign=bottom;endArrow=block;rounded=0;strokeWidth=1.5;" edge="1" parent="1" source="actor_user" target="actor_client">
          <mxGeometry x="0.05" y="10" relative="1" as="geometry">
            <mxPoint as="offset" />
            <Array as="points">
              <mxPoint x="200" y="140" />
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="m2" value="2. 初始化 postMessage 通信通道" style="html=1;verticalAlign=bottom;endArrow=block;rounded=0;strokeWidth=1.5;" edge="1" parent="1" source="actor_client" target="actor_drawio">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="380" y="170" />
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="m3" value="3. 加载已有 XML 结构并渲染画布" style="html=1;verticalAlign=bottom;endArrow=open;dashed=1;endSize=8;rounded=0;" edge="1" parent="1" source="actor_drawio" target="actor_client">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="400" y="200" />
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="m4" value="4. 用户拖拽连线绘制图表" style="html=1;verticalAlign=bottom;endArrow=block;rounded=0;strokeWidth=1.5;" edge="1" parent="1" source="actor_user" target="actor_drawio">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="300" y="240" />
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="m5" value="5. 触发 autosave 事件 (XML + SVG)" style="html=1;verticalAlign=bottom;endArrow=block;rounded=0;strokeWidth=1.5;" edge="1" parent="1" source="actor_drawio" target="actor_client">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="400" y="280" />
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="m6" value="6. 写入 IndexedDB 本地库 &amp; 云端同步" style="html=1;verticalAlign=bottom;endArrow=block;rounded=0;strokeWidth=1.5;" edge="1" parent="1" source="actor_client" target="actor_server">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="480" y="320" />
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="m7" value="7. 返回保存成功确认" style="html=1;verticalAlign=bottom;endArrow=open;dashed=1;endSize=8;rounded=0;" edge="1" parent="1" source="actor_server" target="actor_client">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="500" y="360" />
            </Array>
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

// 5. Swimlane / Process Workflow Template
const SWIMLANE_XML = `<mxfile host="app.diagrams.net" modified="2025-01-01T00:00:00.000Z" agent="Fengye Notes Draw.io" version="24.0.0" type="device">
  <diagram name="Swimlane" id="swimlane-page-1">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- Pool / Swimlane 1: Product / User -->
        <mxCell id="lane1" value="产品 / 需求方 (Product)" style="swimlane;html=1;startSize=25;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="80" y="80" width="640" height="120" as="geometry" />
        </mxCell>
        <mxCell id="n_req" value="提出业务功能需求与交互原型" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#6c8ebf;" vertex="1" parent="lane1">
          <mxGeometry x="40" y="40" width="160" height="50" as="geometry" />
        </mxCell>
        <mxCell id="n_accept" value="功能验收与确认上线" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="lane1">
          <mxGeometry x="460" y="40" width="140" height="50" as="geometry" />
        </mxCell>
        <!-- Swimlane 2: Development -->
        <mxCell id="lane2" value="技术研发 (Engineering)" style="swimlane;html=1;startSize=25;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="80" y="200" width="640" height="130" as="geometry" />
        </mxCell>
        <mxCell id="n_arch" value="技术方案评审与架构设计" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#82b366;" vertex="1" parent="lane2">
          <mxGeometry x="120" y="40" width="160" height="50" as="geometry" />
        </mxCell>
        <mxCell id="n_code" value="前后端编码与单元测试" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#82b366;" vertex="1" parent="lane2">
          <mxGeometry x="320" y="40" width="150" height="50" as="geometry" />
        </mxCell>
        <!-- Swimlane 3: QA & Ops -->
        <mxCell id="lane3" value="测试与运维 (QA &amp; DevOps)" style="swimlane;html=1;startSize=25;fillColor=#fff2cc;strokeColor=#d6b656;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="80" y="330" width="640" height="120" as="geometry" />
        </mxCell>
        <mxCell id="n_qa" value="集成测试 &amp; 自动化回归验证" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#d6b656;" vertex="1" parent="lane3">
          <mxGeometry x="280" y="40" width="170" height="50" as="geometry" />
        </mxCell>
        <mxCell id="n_deploy" value="CI/CD 自动化构建发布生产环境" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#d6b656;" vertex="1" parent="lane3">
          <mxGeometry x="460" y="40" width="160" height="50" as="geometry" />
        </mxCell>
        <!-- Connectors -->
        <mxCell id="ce1" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="n_req" target="n_arch">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ce2" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="n_arch" target="n_code">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ce3" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="n_code" target="n_qa">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ce4" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="n_qa" target="n_deploy">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="ce5" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeWidth=1.5;" edge="1" parent="1" source="n_deploy" target="n_accept">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

// 6. UI Wireframe / Prototype Template
const WIREFRAME_XML = `<mxfile host="app.diagrams.net" modified="2025-01-01T00:00:00.000Z" agent="Fengye Notes Draw.io" version="24.0.0" type="device">
  <diagram name="Wireframe" id="wireframe-page-1">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- Browser Window -->
        <mxCell id="browser" value="Web 应用界面原型 - 枫叶云笔记" style="swimlane;html=1;startSize=30;fillColor=#f8f9fa;strokeColor=#d1d5db;fontStyle=1;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="80" y="60" width="660" height="420" as="geometry" />
        </mxCell>
        <!-- Sidebar -->
        <mxCell id="wf_sidebar" value="左侧导航树&#xa;&#xa;📁 我的笔记&#xa;⭐ 标星收藏&#xa;🎨 Draw.io 图表&#xa;🗑️ 回收站" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#e5e7eb;align=left;spacingLeft=15;verticalAlign=top;spacingTop=15;" vertex="1" parent="browser">
          <mxGeometry x="10" y="40" width="160" height="370" as="geometry" />
        </mxCell>
        <!-- Header Bar -->
        <mxCell id="wf_header" value="🔍 全局搜索笔记 / 图表...                     [+ 新建图表]  [ 导出 ]" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#e5e7eb;align=left;spacingLeft=15;" vertex="1" parent="browser">
          <mxGeometry x="180" y="40" width="470" height="40" as="geometry" />
        </mxCell>
        <!-- Canvas Main Area -->
        <mxCell id="wf_canvas" value="📐 Draw.io 图表可视化工作区 (Canvas Stage)&#xa;&#xa;支持图形拖拽、连线、文本编辑、图层管理与实时保存" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f3f4f6;strokeColor=#d1d5db;fontStyle=1;align=center;verticalAlign=middle;" vertex="1" parent="browser">
          <mxGeometry x="180" y="90" width="470" height="320" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

// Blank Canvas Default
const BLANK_XML = `<mxfile host="app.diagrams.net" modified="2025-01-01T00:00:00.000Z" agent="Fengye Notes Draw.io" version="24.0.0" type="device">
  <diagram name="Page-1" id="blank-page-1">
    <mxGraphModel dx="1000" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" value="双击此处编辑文本，或从左侧形状库拖拽图形开始绘制" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=14;fontStyle=1;" vertex="1" parent="1">
          <mxGeometry x="240" y="160" width="340" height="80" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

export const DRAWIO_TEMPLATES: DrawioTemplateInfo[] = [
  {
    id: 'blank',
    name: '空白图表',
    category: '基础',
    description: '干净简洁的初始绘图画布，从零开始随心绘制',
    xml: BLANK_XML,
  },
  {
    id: 'flowchart',
    name: '标准流程图',
    category: '流程与逻辑',
    description: '包含开始、步骤处理、条件判断、异常分支的标准流程图',
    xml: FLOWCHART_XML,
  },
  {
    id: 'architecture',
    name: '云架构与微服务',
    category: '软件架构',
    description: '客户端、反向代理网关、微服务集群与持久化存储的分层架构图',
    xml: ARCHITECTURE_XML,
  },
  {
    id: 'erd',
    name: '实体关系图 (ERD)',
    category: '数据模型',
    description: '数据库表结构、主外键关联与 1:N 映射关系图',
    xml: ERD_XML,
  },
  {
    id: 'sequence',
    name: 'UML 时序交互图',
    category: '软件架构',
    description: '用户、前端、Draw.io 引擎与服务端交互时序图',
    xml: SEQUENCE_XML,
  },
  {
    id: 'swimlane',
    name: '跨职能泳道图',
    category: '流程与逻辑',
    description: '产品、研发与测试运维团队协作的业务流程泳道图',
    xml: SWIMLANE_XML,
  },
  {
    id: 'wireframe',
    name: 'UI 界面原型图',
    category: '产品设计',
    description: 'Web 应用界面原型、侧边栏与主工作区排版线框图',
    xml: WIREFRAME_XML,
  },
];

/**
 * Creates default Draw.io XML for a note
 */
export function createDefaultDrawioXml(title = '无标题图表', templateId = 'flowchart'): string {
  const tpl = DRAWIO_TEMPLATES.find((t) => t.id === templateId) || DRAWIO_TEMPLATES[1];
  let xml = tpl.xml;
  if (title && title !== '无标题图表') {
    xml = xml.replace('开始 / Start', `${title} (开始)`);
  }
  return xml;
}

/**
 * Clean and extract valid Draw.io XML from note content
 */
export function extractDrawioXml(content: string): string {
  if (!content) return BLANK_XML;
  const trimmed = content.trim();
  if (trimmed.startsWith('<mxfile') || trimmed.startsWith('<mxGraphModel') || trimmed.includes('<mxGraphModel')) {
    return trimmed;
  }
  // If wrapped in JSON or other format
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.xml === 'string') {
      return parsed.xml;
    }
  } catch {}
  return BLANK_XML;
}

/**
 * Extract all text node values from Draw.io XML for full-text search indexing
 */
export function extractDrawioTextNodes(xml: string): string[] {
  if (!xml) return [];
  const textMatches: string[] = [];
  // Match value="..." in mxCell or Object tags
  const regex = /value="([^"]+)"/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const rawVal = match[1];
    if (rawVal && rawVal.trim()) {
      // Unescape HTML entities
      const unescaped = rawVal
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#xa;/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .trim();
      if (unescaped) {
        textMatches.push(unescaped);
      }
    }
  }
  return textMatches;
}

/**
 * Generate a clean standalone SVG preview from Draw.io node labels when real SVG isn't yet rendered
 */
export function generateFallbackSvgPreview(title: string, nodes: string[] = []): string {
  const safeTitle = (title || 'Draw.io 图表').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sampleNodes = nodes.slice(0, 4);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%">
    <defs>
      <linearGradient id="bg_grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fffbeb"/>
        <stop offset="100%" stop-color="#fef3c7"/>
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.08"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg_grad)" rx="8"/>
    <!-- Grid pattern background -->
    <path d="M 0 40 L 400 40 M 0 80 L 400 80 M 0 120 L 400 120 M 0 160 L 400 160 M 0 200 L 400 200" stroke="#fde68a" stroke-width="0.75" stroke-dasharray="3,3"/>
    <path d="M 50 0 L 50 240 M 100 0 L 100 240 M 150 0 L 150 240 M 200 0 L 200 240 M 250 0 L 250 240 M 300 0 L 300 240 M 350 0 L 350 240" stroke="#fde68a" stroke-width="0.75" stroke-dasharray="3,3"/>

    <!-- Diagram elements preview -->
    <g transform="translate(40, 35)">
      <!-- Start Node -->
      <rect x="0" y="0" width="120" height="40" rx="20" fill="#d5e8d4" stroke="#82b366" stroke-width="1.5" filter="url(#shadow)"/>
      <text x="60" y="24" text-anchor="middle" fill="#27272a" font-size="11" font-weight="600" font-family="system-ui, sans-serif">
        ${sampleNodes[0] ? sampleNodes[0].slice(0, 10) : '开始 (Start)'}
      </text>

      <!-- Connector line -->
      <path d="M 120 20 L 180 20" stroke="#d97706" stroke-width="2" stroke-linecap="round" marker-end="url(#arrow)"/>
      <polygon points="180,20 172,16 172,24" fill="#d97706"/>

      <!-- Process Node -->
      <rect x="180" y="0" width="140" height="40" rx="6" fill="#dae8fc" stroke="#6c8ebf" stroke-width="1.5" filter="url(#shadow)"/>
      <text x="250" y="24" text-anchor="middle" fill="#27272a" font-size="11" font-weight="600" font-family="system-ui, sans-serif">
        ${sampleNodes[1] ? sampleNodes[1].slice(0, 12) : '业务处理逻辑'}
      </text>

      <!-- Down line -->
      <path d="M 250 40 L 250 85" stroke="#d97706" stroke-width="2" stroke-linecap="round"/>
      <polygon points="250,85 246,77 254,77" fill="#d97706"/>

      <!-- Decision Diamond -->
      <polygon points="250,85 305,120 250,155 195,120" fill="#ffe6cc" stroke="#d79b00" stroke-width="1.5" filter="url(#shadow)"/>
      <text x="250" y="124" text-anchor="middle" fill="#27272a" font-size="10" font-weight="bold" font-family="system-ui, sans-serif">
        ${sampleNodes[2] ? sampleNodes[2].slice(0, 8) : '条件判断'}
      </text>

      <!-- Branch to End -->
      <path d="M 195 120 L 120 120" stroke="#d97706" stroke-width="2"/>
      <polygon points="120,120 128,116 128,124" fill="#d97706"/>

      <!-- End Node -->
      <rect x="0" y="100" width="120" height="40" rx="20" fill="#d5e8d4" stroke="#82b366" stroke-width="1.5" filter="url(#shadow)"/>
      <text x="60" y="124" text-anchor="middle" fill="#27272a" font-size="11" font-weight="600" font-family="system-ui, sans-serif">
        ${sampleNodes[3] ? sampleNodes[3].slice(0, 10) : '结束 (End)'}
      </text>
    </g>

    <!-- Title Badge -->
    <rect x="12" y="200" width="180" height="26" rx="13" fill="#ffffff" fill-opacity="0.9" stroke="#f59e0b" stroke-width="1"/>
    <text x="24" y="217" fill="#b45309" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">
      📐 ${safeTitle.slice(0, 18)}
    </text>
  </svg>`;
}
