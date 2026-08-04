# 龙飞个人工作台 · 同步服务（长期常驻版）

把工作台前端 + 云端同步后端打包成一个**零依赖 Node 服务**，部署到任意 Node 平台后，
**一个网址既是工作台、又是同步服务器**——电脑和手机打开同一个链接，数据自动实时一致，不再依赖临时沙箱。

## 目录结构

```
sync-server/
├── server.js        # 零依赖后端：同步 API + 静态托管（同一进程）
├── package.json     # 启动脚本 node server.js
├── .gitignore       # 忽略 data/（同步数据）和 node_modules
└── public/
    └── index.html   # 工作台前端页面
```

## 本地运行（先验证）

```bash
cd sync-server
node server.js
# 打开 http://localhost:8787 即是工作台
```

## 部署到 Render（推荐，免费、最省事）

1. 把 `sync-server` 整个文件夹推到你的 GitHub 仓库（或新建一个仓库专门放它）。
2. 打开 https://render.com → 注册/登录 → **New → Web Service** → 连接该 GitHub 仓库。
3. 配置：
   - **Build Command**：留空（零依赖，无需安装）
   - **Start Command**：`node server.js`
   - **Instance Type**：Free（免费）
4. 点击 **Create Web Service**，等待部署完成，得到类似 `https://longfei-workbench.onrender.com` 的地址。
5. **（重要）持久化数据**：Render 免费层文件系统是临时的，实例重启会清空 `data/`。
   到 Render 控制台给该服务挂一块 **Disk**（持久磁盘，例如挂载到 `/data`），
   然后在 **Environment** 里加环境变量 `DATA_DIR=/data`。这样同步数据长期保留。

## 部署到 Railway / Koyeb（可选）

- **Railway**：新建 Project → Deploy 该仓库 → Start Command 填 `node server.js`。免费层有用量额度，挂持久卷到 `DATA_DIR` 即可长期存数据。
- **Koyeb**：新建 App → 选 GitHub 仓库 → 运行命令 `node server.js`。Koyeb 默认提供持久卷，数据天然长期保留，最稳。

> 无论哪个平台，`PORT` 都由平台自动注入，无需手动设置；如需改数据目录，设环境变量 `DATA_DIR`。

## 手机 / 电脑如何同步

1. 电脑和手机都用**浏览器**打开部署得到的那个链接（如 `https://longfei-workbench.onrender.com`）。
2. 点顶栏 **🔄 同步** → 弹窗里：
   - **同步服务器地址**：**留空**（因为页面和同步服务是同一个地址，自动同源）
   - **项目名称**：两端填**同一个**，例如 `龙飞电气-许昌项目`
   - **同步口令**：自己设一个，两端**一致**（首次连接即设定，之后不可改）
   - 打开「启用同步」→ **保存设置**
3. 两台设备都保存后，任意一端新增/修改（待办、施工日报、记账、巡检…），800ms 内自动推送到服务器，另一端打开即同步。

也可走「手动备份」兜底：顶栏 **⬇ 备份** 导出一个 json，换设备用 **⬆ 恢复** 导入。

## 安全提醒

- 数据以明文存于运行服务器，且接口仅做口令校验。**请勿在公网裸奔**。
- 公网部署建议加一层保护：反向代理 Basic Auth、或用 Cloudflare 访问规则限制、或仅在内网/VPN 使用。
- 口令用 sha256+salt 存储，不会明文落盘，但传输过程是明文 HTTP——正式用建议套一层 HTTPS（各平台默认已提供 https 域名）。

## 接口说明（开发者）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回 `{"ok":true}` |
| GET | `/api/:project?pass=xxx` | 拉取该项目数据 `{"revs", "data"}` |
| POST | `/api/:project` | 推送，body `{"pass","revs","data"}`，按集合 rev 后写覆盖合并 |

同步的集合：todos / plans / pomo / accs / water / inspects / works / dailys / theme
