import { Folder, Note } from '../types';

export const INITIAL_FOLDERS: Folder[] = [
  {
    id: 'folder-concurrency',
    name: '多线程-并发编程',
    parentId: null,
    order: 1,
    isOpen: true,
  },
  {
    id: 'folder-juc-source',
    name: 'JUC底层源码',
    parentId: 'folder-concurrency',
    order: 1,
    isOpen: true,
  },
  {
    id: 'folder-troubleshooting',
    name: '专治疑难杂症',
    parentId: null,
    order: 2,
    isOpen: true,
  },
  {
    id: 'folder-diary',
    name: '日记',
    parentId: null,
    order: 3,
    isOpen: true,
  },
  {
    id: 'folder-linux',
    name: 'Linux',
    parentId: null,
    order: 4,
    isOpen: false,
  },
  {
    id: 'folder-linux-docker',
    name: 'Docker与容器化',
    parentId: 'folder-linux',
    order: 1,
    isOpen: false,
  },
];

export const INITIAL_NOTES: Note[] = [
  {
    id: 'note-1',
    title: '多线程-并发编程随记',
    folderId: 'folder-concurrency',
    createdAt: '2025-12-30 10:06',
    updatedAt: '2025-12-30 10:06',
    isStarred: true,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['并发', '多线程', 'JUC', '锁优化'],
    format: 'markdown',
    content: `# 多线程与高并发编程随记

## 一、并发与并行的本质区别

- **并发 (Concurrency)**: 多个任务在**同一个时间段**内交替执行（逻辑上的同时）。
- **并行 (Parallelism)**: 多个任务在**同一物理时刻**在不同的 CPU 核心上同时执行。

---

## 二、线程安全的核心三要素

1. **原子性 (Atomicity)**: 一个操作不可中断，要么全部执行成功，要么全部失败。
2. **可见性 (Visibility)**: 一个线程对共享变量的修改，另一个线程能立刻感知到。
3. **有序性 (Ordering)**: 程序执行的顺序按照代码的先后顺序执行（防止指令重排）。

---

## 三、常用锁与同步机制对比

| 机制类型 | 典型实现 | 适用场景 | 性能开销 |
| :--- | :--- | :--- | :--- |
| **乐观锁** | CAS / AtomicInteger | 读多写少、冲突极小 | 极低（无上下文切换） |
| **悲观锁** | synchronized / ReentrantLock | 写操作频繁、长临界区 | 中等到高 |
| **读写锁** | ReentrantReadWriteLock | 读远多于写的共享资源 | 读并行，写独占 |
| **无锁并发** | ThreadLocal / CopyOnWrite | 线程独享或写极少 | 空间换时间 |

---

## 四、经典示例代码：双重检查锁定 (DCL) 单例模式

\`\`\`java
public class Singleton {
    // 必须加上 volatile 防止指令重排
    private static volatile Singleton instance;

    private Singleton() {}

    public static Singleton getInstance() {
        if (instance == null) {
            synchronized (Singleton.class) {
                if (instance == null) {
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
\`\`\`

> 💡 **重点提示**: \`instance = new Singleton()\` 包含三个步骤：分配内存 -> 初始化对象 -> 变量指向内存。没有 \`volatile\` 可能导致其他线程拿到未完全初始化的半成品对象。
`,
  },
  {
    id: 'note-2',
    title: '学习引用',
    folderId: 'folder-concurrency',
    createdAt: '2025-12-30 10:02',
    updatedAt: '2025-12-30 10:02',
    isStarred: false,
    isFavorite: false,
    isShared: true,
    shareUrl: 'https://maple-note.cloud/s/c98df23a',
    isDeleted: false,
    tags: ['参考资料', '知识体系', '书籍清单'],
    format: 'markdown',
    content: `# 并发编程与计算机系统学习引用文献

> “编写正确的并发程序是一门平衡的艺术，它要求我们既要保证状态的一致性，又要最大化系统的吞吐量。”

---

## 推荐书籍与论文

1. **《Java 并发编程实战》 (Java Concurrency in Practice)** - Brian Goetz
   - 必读经典，深入剖析 Java 内存模型 (JMM)、线程池设计与并发集合。
2. **《深入理解计算机系统》 (CS:APP)** - Randal E. Bryant
   - 掌握现代 CPU 多核架构、L1/L2/L3 缓存一致性协议 (MESI) 以及虚拟内存。
3. **《Designing Data-Intensive Applications》 (DDIA)** - Martin Kleppmann
   - 分布式并发控制、事务隔离级别 (ACID)、2PC 与 Raft 共识算法。

---

## 核心知识卡片

- [x] Java Memory Model 8 种原子操作
- [x] CAS 算法中的 ABA 问题及版本戳解决方法 (\`AtomicStampedReference\`)
- [ ] AQS (AbstractQueuedSynchronizer) 独占式与共享式节点同步队列原理
- [ ] Disruptor 高性能环形缓冲区 (RingBuffer) 无锁架构

---

## 在线资源与规范
- [JSR-133: Java Memory Model and Thread Specification](https://jcp.org/en/jsr/detail?id=133)
- [Linux Man Pages: pthread_create & epoll](https://man7.org/linux/man-pages/)
`,
  },
  {
    id: 'note-juc-aqs',
    title: 'AQS 同步器设计原理与 Node 队列解析',
    folderId: 'folder-juc-source',
    createdAt: '2025-12-29 16:20',
    updatedAt: '2025-12-30 08:30',
    isStarred: true,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['AQS', 'CLH队列', 'CAS', 'ReentrantLock'],
    format: 'markdown',
    content: `# AQS (AbstractQueuedSynchronizer) 核心机制

## 1. 核心架构组成
- **volatile int state**: 资源同步状态（0 表示空闲，>=1 表示已被线程持有）。
- **CLH 双向 FIFO 队列**: 等待锁的线程被封装为 \`Node\`，通过 CAS 自旋入队并被挂起 (\`LockSupport.park\`)。
- **独占模式 vs 共享模式**:
  - 独占式（如 \`ReentrantLock\`）：只有一个线程能成功获取 state。
  - 共享式（如 \`CountDownLatch\`, \`Semaphore\`）：多个线程可以同时获取资源。
`,
  },
  {
    id: 'note-3',
    title: 'Vue 3 与 Composition API 核心精粹',
    folderId: 'folder-troubleshooting',
    createdAt: '2025-12-28 15:30',
    updatedAt: '2025-12-29 11:20',
    isStarred: true,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['Vue3', '前端开发', '响应式原理'],
    format: 'markdown',
    content: `# Vue 3 核心架构与 Composition API 实战

## 响应式系统的底层跃迁

Vue 3 采用 **Proxy** 完全重写了响应式系统，解决了 Vue 2 中 \`Object.defineProperty\` 的核心痛点：
- 支持动态新增/删除对象属性的拦截
- 原生支持 Array 索引修改及 \`length\` 变更
- 支持 \`Map\`, \`Set\`, \`WeakMap\`, \`WeakSet\` 等新集合类型

\`\`\`typescript
import { ref, reactive, computed, watchEffect } from 'vue';

export function useCounter(initialVal = 0) {
  const count = ref(initialVal);
  const doubleCount = computed(() => count.value * 2);

  function increment() {
    count.value++;
  }

  return { count, doubleCount, increment };
}
\`\`\`
`,
  },
  {
    id: 'note-4',
    title: '2026 年度技术与生活规划',
    folderId: 'folder-diary',
    createdAt: '2025-12-25 09:15',
    updatedAt: '2025-12-26 18:00',
    isStarred: false,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['个人成长', '目标管理', '年终复盘'],
    format: 'markdown',
    content: `# 2026 年度规划与成长目标

## 🎯 技术精进目标
1. 深入掌握 Rust 语言及 WebAssembly 编译链路
2. 架构设计：主导 1 个高可用微服务重构项目
3. 开源贡献：参与主流开源前端工具链 PR 提交

## 🧘 生活与健康
- 保持每周至少 3 次有氧跑步 (每次 5km)
- 保持每天深度阅读 30 分钟
- 保证规律作息，充足睡眠
`,
  },
  {
    id: 'note-5',
    title: 'Linux 生产环境常用命令速查',
    folderId: 'folder-linux',
    createdAt: '2025-12-20 14:00',
    updatedAt: '2025-12-22 16:45',
    isStarred: true,
    isFavorite: false,
    isShared: false,
    isDeleted: false,
    tags: ['Linux', 'DevOps', '运维命令'],
    format: 'markdown',
    content: `# Linux 运维与排查必备命令备忘

### 1. CPU 与内存分析
\`\`\`bash
# 实时监控进程及负载
top -c
htop

# 内存使用详情
free -h
\`\`\`

### 2. 网络与端口排查
\`\`\`bash
# 查看监听端口与对应进程
ss -tulpn | grep 3000
netstat -anp | grep 8080
\`\`\`

### 3. 磁盘空间快速分析
\`\`\`bash
# 查看各分区占用
df -h

# 查看当前目录下各文件夹占用大小
du -sh * | sort -hr | head -n 10
\`\`\`
`,
  },
  {
    id: 'note-docker',
    title: 'Docker 常用命令与 Compose 模版',
    folderId: 'folder-linux-docker',
    createdAt: '2025-12-21 11:00',
    updatedAt: '2025-12-21 11:30',
    isStarred: false,
    isFavorite: false,
    isShared: false,
    isDeleted: false,
    tags: ['Docker', '容器', 'Compose'],
    format: 'markdown',
    content: `# Docker 与 Docker Compose 生产实战

## 常用操作指令
\`\`\`bash
# 查看容器状态与资源占用
docker ps -a
docker stats

# 清理无用镜像与缓存
docker system prune -a --volumes
\`\`\`
`,
  },
  {
    id: 'note-mindmap-concurrency',
    title: '高并发核心架构与锁机制思维导图',
    folderId: 'folder-concurrency',
    createdAt: '2025-12-30 11:20',
    updatedAt: '2025-12-30 11:20',
    isStarred: true,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['思维导图', '高并发', '架构设计'],
    format: 'mindmap',
    type: 'mindmap',
    content: JSON.stringify(
      {
        root: {
          data: { text: '高并发与多线程架构', expandState: 'expand' },
          children: [
            {
              data: { text: '线程安全三大特性', priority: 1 },
              children: [
                { data: { text: '原子性 (Atomicity)' } },
                { data: { text: '可见性 (Visibility)' } },
                { data: { text: '有序性 (Ordering)' } }
              ]
            },
            {
              data: { text: '锁优化与同步机制', priority: 2 },
              children: [
                { data: { text: '乐观锁 (CAS / Atomic)' } },
                { data: { text: '悲观锁 (synchronized / ReentrantLock)' } },
                { data: { text: '读写分离锁 (ReentrantReadWriteLock)' } }
              ]
            },
            {
              data: { text: 'JUC 并发工具集', priority: 3 },
              children: [
                { data: { text: 'CountDownLatch (倒计时门闩)' } },
                { data: { text: 'CyclicBarrier (循环栅栏)' } },
                { data: { text: 'Semaphore (信号量限流)' } }
              ]
            },
            {
              data: { text: '线程池最佳实践', priority: 4 },
              children: [
                { data: { text: '核心线程数与最大线程数' } },
                { data: { text: '阻塞队列选型 (Array vs Linked)' } },
                { data: { text: '四大拒绝策略 (Abort/CallerRuns)' } }
              ]
            }
          ]
        },
        template: 'default',
        theme: 'fresh-green'
      },
      null,
      2
    )
  },
  {
    id: 'note-mindmap-linux',
    title: 'Linux 知识体系与排障脑图',
    folderId: 'folder-linux',
    createdAt: '2025-12-22 17:00',
    updatedAt: '2025-12-22 17:00',
    isStarred: false,
    isFavorite: true,
    isShared: false,
    isDeleted: false,
    tags: ['思维导图', 'Linux', '运维'],
    format: 'mindmap',
    type: 'mindmap',
    content: JSON.stringify(
      {
        root: {
          data: { text: 'Linux 系统核心全景', expandState: 'expand' },
          children: [
            {
              data: { text: '系统资源排查', priority: 1 },
              children: [
                { data: { text: 'CPU (top / htop / uptime)' } },
                { data: { text: '内存 (free -h / vmstat)' } },
                { data: { text: '磁盘 (df -h / du -sh / iostat)' } }
              ]
            },
            {
              data: { text: '网络与端口监控', priority: 2 },
              children: [
                { data: { text: '端口状态 (ss -tulpn / netstat)' } },
                { data: { text: '网络抓包 (tcpdump / wireshark)' } },
                { data: { text: '路由连通性 (ping / traceroute)' } }
              ]
            },
            {
              data: { text: '进程与服务管理', priority: 3 },
              children: [
                { data: { text: 'systemctl 管理服务' } },
                { data: { text: 'kill / pkill 信号处理' } },
                { data: { text: 'crontab 定时任务' } }
              ]
            }
          ]
        },
        template: 'right',
        theme: 'fresh-blue'
      },
      null,
      2
    )
  }
];
