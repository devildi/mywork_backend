# MyWork Backend

MyWork 后台服务系统，为行程规划、智能生成提供数据支持和后台管理接口。该系统包含了核心 Web 服务、基于 Puppeteer 的自动化数据爬虫、Agenda 定时任务处理，以及基于 LangChain 的大模型数据富化模块。

---

## 🛠️ 技术栈

### 核心框架 & 接口
* **Runtime**: Node.js (v20+)
* **Web Framework**: Koa2 (使用 `koa-router` 进行路由，`koa-body` 处理解析，`koa-jwt` 安全验证)
* **Real-time Communication**: Socket.io (用于双向实时通信)
* **RPC**: gRPC (`@grpc/grpc-js` / `@grpc/proto-loader` 模块)

### 数据库 & 定时任务
* **Database**: MongoDB (使用 `mongoose` 作为 ODM)
* **Job Scheduler**: Agenda (基于 MongoDB 存储的定时/分布式任务队列)

### 数据抓取 & 大模型
* **Web Crawler**: Puppeteer & Puppeteer-Cluster (配合 Stealth 插件防反爬，抓取 12306、Google Travel 等行程数据)
* **LLM Integration**: LangChain & OpenAI / DeepSeek (用于行程及目的地数据的解析和富化)

---

## 📂 项目主要结构

```text
├── app/                  # Koa 业务主目录
│   ├── controllers/      # 接口控制器 (如 train.js, flight.js)
│   ├── models/           # Mongoose 数据库 Schema 模型
│   ├── routes/           # 路由配置
│   ├── jobs/             # Agenda 定时任务处理器
│   ├── lib/              # 库文件 (包括 agenda 客户端配置)
│   ├── script/           # 独立的抓取脚本 (如 12306 爬虫)
│   └── index.js          # 后台主服务入口
├── db/                   # MongoDB 本地数据存储目录 (开发环境)
├── scripts/              # 运维/异步脚本
│   ├── start-enricher.js # Agenda Worker 启动脚本
│   └── mongo-init.js     # MongoDB 容器初始化创建用户脚本
├── ecosystem.config.js   # PM2 配置文件 (原生环境部署使用)
├── Dockerfile            # Docker 镜像构建文件 (已配置 Chromium 运行库及中文黑体)
└── docker-compose.yml    # Docker 容器编排配置文件 (集成 MongoDB, Backend, Worker)
```

---

## 💻 本地开发环境启动服务 (非 Docker)

### 1. 前提条件
确保本地已安装：
* Node.js (v18 或 v20+)
* MongoDB 数据库并已启动

### 2. 配置环境变量
在项目根目录下新建 `.env` 文件，填入所需 API 密钥：
```env
DEEPSEEK_API_KEY="你的DeepSeek密钥"
gaodeWebKey="你的高德地图Web服务Key"
tencent_Map_Key="你的腾讯地图Key"
accessKey="七牛云AccessKey"
secretKey="七牛云SecretKey"
appid="微信公众号/小程序AppID"
wesecret="微信AppSecret"
```

### 3. 安装依赖
```bash
npm install
```

### 4. 启动服务
你可以开启两个终端窗口分别运行后台和后台异步 Worker：

* **启动 Web 主服务**:
  ```bash
  npm run dev
  ```
  *(默认启动在端口 `4000`)*

* **启动后台任务 Worker (Agenda)**:
  ```bash
  npm run worker:enrich
  ```

---

## 🐳 Docker 生产环境容器化部署

利用 Docker 可以实现一键部署，不仅免去了手动安装配置 MongoDB，还彻底解决了 Puppeteer 运行所需的 Chromium 依赖库缺失问题。

### 1. 在 Windows 10 (WSL2) 上部署

#### 准备工作
1. 开启主板 CPU 虚拟化 (可在任务管理器 -> 性能 -> CPU 中检查)。
2. 安装并启用 **WSL 2** (在管理员模式 PowerShell 运行 `wsl --install` 后重启电脑)。
3. 安装 **Docker Desktop for Windows**，并在设置中确保勾选了 `Use WSL 2 based engine`。
4. 从 GitHub 拉取本项目后，在项目根目录下创建上述的 `.env` 文件。

#### 启动服务
打开 PowerShell/CMD，定位到项目根目录，运行：
```bash
docker compose up -d --build
```

---

### 2. 在 Linux (如 Ubuntu/Debian) 上部署

在生产 Linux 服务器上，安装 Docker 引擎后，可以直接拉取部署。

#### 准备工作 (Ubuntu 安装 Docker)
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker --now
```

#### 启动服务
在包含项目文件的根目录下，配置好 `.env`，然后运行：
```bash
sudo docker compose up -d --build
```

---

### 3. Docker 常用运维命令 (Win/Linux 通用)

* **查看运行状态**:
  ```bash
  docker compose ps
  ```
* **查看容器日志**:
  ```bash
  # 查看所有服务的实时日志
  docker compose logs -f
  
  # 单独查看后台 Web 服务的日志
  docker compose logs -f backend
  ```
* **停止并清理容器**:
  ```bash
  # 停止运行，保留数据卷数据
  docker compose down
  
  # 停止并彻底删除 MongoDB 数据卷（会清空数据库！）
  docker compose down -v
  ```
* **数据持久化**:
  * MongoDB 数据持久化保存在 Docker 管理的命名数据卷 `mongodb_data` 中。
  * 爬虫抓取得到的 xlsx 表格及图片数据持久化存放在宿主机的 `./results/` 目录下。

---

## ⚡ 附录：独立运维脚本介绍
* `npm run worker:enrich`: 启动 Agenda 旅行数据富化 Worker（调用大模型）。
* `node check_stories.js`: 检查并校验故事数据。
* `node print_stories.js`: 打印故事统计信息。
* `node clean_double_prefix.js`: 数据清洗脚本，去除前缀重叠等脏数据。
