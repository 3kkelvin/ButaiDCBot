# ==========================================
# Stage 1: Builder (負責安裝所有依賴並編譯 TS)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# 複製 package.json 與 package-lock.json
COPY package*.json ./

# 安裝所有依賴
RUN npm install

# 複製原始碼
COPY . .

# 執行 TypeScript 編譯
RUN npm run build

# ==========================================
# Stage 2: Production (負責執行編譯後的程式)
# ==========================================
FROM node:22-alpine

# 設定為生產環境
ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./

# 只安裝正式環境需要的依賴 (忽略 devDependencies)
RUN npm install --omit=production

# 從 builder 階段把編譯好的 dist 目錄與 database 目錄複製過來
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/database ./database

# 標示暴露健康檢查的 Port (預設為 5000)
EXPOSE 5000

# 啟動機器人
CMD ["npm", "start"]
