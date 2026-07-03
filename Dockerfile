FROM node:20-slim

# ===== system deps =====
RUN apt-get update && apt-get install -y \
    ca-certificates \
    wget \
    gnupg \
    fonts-wqy-zenhei \
    fonts-noto-cjk \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ===== working dir =====
WORKDIR /usr/src/app

# ===== env =====
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ===== install deps =====
COPY package*.json ./

# 生产依赖安装（避免 dev 依赖污染）
RUN npm ci --omit=dev

# ===== app =====
COPY . .

EXPOSE 4000

# 👉 不依赖 cross-env（关键修复）
CMD ["npm", "start"]