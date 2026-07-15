# ButaiDCBot 🤖

這是一個基於 **TypeScript** 與 **discord.ts** (或 **discord.js**) 架構開發的 Discord 機器人專案。

## 🏗️ 技術棧與設計模式
- **核心語言**：TypeScript (嚴格模式 `strict: true`)
- **Discord 框架**：discord.ts / discordx / discord.js
- **資料庫**：Supabase (PostgreSQL) — 本專案中 DB 屬於邊緣輔助角色，不儲存使用者資料
- **架構模式**：嚴格的三層式架構 (Presentation Layer -> Service Layer -> Data Access Layer)

---

## 📂 專案架構與開發指南

為了方便人類開發者與協同 AI 快速理解與遵循開發標準，請務必先閱讀以下設計文件：

1. 📖 **[開發規範文件 (docs/development_standards.md)](docs/development_standards.md)**
   - TypeScript 撰寫標準與命名風格。
   - 環境變數與數字參數安全規範（**嚴禁寫死身分組 ID 與頻道 ID**）。
   - 三層式架構的程式碼邊界職責。
   - 全域頂層錯誤捕獲 (`asyncHandler`)、自定義 `AppError` 與非關鍵旁路服務的 `Fail-Safe` 容錯設計。

2. 🏗️ **[架構設計文件 (docs/project_architecture.md)](docs/project_architecture.md)**
   - 三層式架構與 Discord Bot 事件/指令處理的對照映射。
   - 邊緣化資料庫 (Supabase Postgres) 設計原則。
   - 全域快取與 **Promise Collapsing (請求合併)** 機制。
   - 分散式鎖 (`LockService.runWithLock`) Postgres 實作防連點設計。
   - 配置化排程任務系統。

---

## 🛠️ 開發與分支流程 (Development Workflow)

本專案實施嚴格的分支保護與協作規範：

### 1. AI 開發規範 (AI Guideline)
* **強制閱讀**：任何 AI 助理在開始產生或修改程式碼前，**必須完整閱讀本專案的 [開發規範文件](docs/development_standards.md) 與 [系統架構文件](docs/project_architecture.md)**，嚴禁憑空猜測或破壞三層架構與環境變數安全邊界。

### 2. Git 分支策略
* **開發分支 (Feature Branch)**：
  * 開發者禁止直接在 `dev` 或 `main` 分支上進行提交。
  * 請從最新的 `dev` 拉取個人專屬的分支（例如 `feature/your-name-task` 或 `bugfix/issue-name`）進行開發。
* **Dev 分支 (開發/測試)**：
  * **部署位置**：自動部署於 **3k 的本地伺服器**。
  * **指向目標**：連接 **Discord 測試伺服器**。
* **Main 分支 (正式/生產)**：
  * **部署位置**：自動部署於 **3k 的線上 EC2 伺服器**。
  * **指向目標**：連接 **大舞台正式伺服器**。

### 3. 合併與 PR 機制 (Merge & Review)
* **禁止直接合併**：`dev` 與 `main` 設為唯讀保護分支，**禁止直接執行 git merge 或 push 提交**。
* **提交 PR 流程**：
  * 開發完成後，向 `dev` 分支提交 Pull Request (PR)。
  * **必須由 3k 進行人工程式碼 Review**，審查通過後才可合併。
* **環境變數變更通報**：
  * 若本次開發有變更、新增環境變數（如 `.env` 中的新變數），**必須主動私訊並提供給 3k**。
  * 3k 會手動登入 Jenkins 憑證管理台進行更新，若未提供將導致 CI/CD 建置失敗或運行異常。

---

## 🚀 部署與 CI/CD 具體操作 (Deployment Setup)

本專案透過 `Jenkins` 與 `Docker 虛擬機` 進行全自動化 CI/CD。具體搭建與部署操作步驟如下：

```
                      [ Git Repository (GitHub/GitLab) ]
                                      │
                                      ▼ (Webhook 觸發)
                            ┌───────────────────┐
                            │ 1. Jenkins 伺服器  │ (專門處理 CI/CD 建置)
                            │   - Docker Build  │
                            │   - Credentials   │
                            └─────────┬─────────┘
                                      │
                         SSH 遠端操控 │ (或 Docker Context TCP)
                                      ▼
                            ┌───────────────────┐
                            │ 2. Docker 運行主機 │ (虛擬機 / AWS EC2)
                            │   - Running Bot   │
                            │   - Health Check  │
                            └───────────────────┘
```

### 第一步：搭建 Jenkins 伺服器 (CI/CD 執行器)
1. **系統準備**：準備一台獨立伺服器或在本機安裝 VM (建議使用 Ubuntu Server 20.04/22.04 LTS)。
2. **安裝軟體**：安裝 **Git**、**Docker Engine**，並安裝 **Jenkins**：
   * Jenkins 安裝後，**必須**將 jenkins 使用者加入 docker 群組，否則 Jenkins 執行 pipeline 時會因權限不足無法打包 Docker Image：
     ```bash
     sudo usermod -aG docker jenkins
     sudo systemctl restart jenkins
     ```
3. **安裝 Jenkins 外掛程式**：進入 Jenkins「管理系統」->「外掛程式管理」，搜尋並安裝：
   * `Pipeline`
   * `Credentials Binding Plugin` (用以安全讀取機密 .env)
   * `SSH Agent Plugin` (若 Jenkins 與運行虛擬機分屬不同機器，可用於 SSH 連線)

### 第二步：配置 Jenkins 環境變數憑證 (Credentials)
1. **建立憑證**：進入 Jenkins「系統管理」->「憑證 (Credentials)」->「全域」。
2. **新增密鑰憑證**：
   * 新增一個類型為 **Secret file** 的憑證。
   * **憑證 ID 設定**：
     * Dev 環境請填：`env-secret-dev` (內含指向 Discord 測試伺服器的金鑰與配置)
     * Main 環境請填：`env-secret-main` (內含指向大舞台正式伺服器的金鑰與配置)
   * **檔案內容**：將對應環境的 `.env` 檔案上傳（內含 `DISCORD_TOKEN`、`SUPABASE_KEY` 等）。

### 第三步：搭建 Docker 運行虛擬機 (Host)
1. **虛擬機準備**：
   * **開發/測試**：使用 3k 的本地 Linux 伺服器/虛擬機。
   * **正式生產**：使用 AWS EC2 虛擬機實例。
2. **軟體準備**：在虛擬機中安裝 Docker 與 Docker Compose：
   ```bash
   sudo apt-get update
   sudo apt-get install docker.io -y
   ```
3. **安全性群組/防火牆設定**：
   * 若採用「方案一 (本地健康檢查伺服器)」，Bot 會在容器內監聽本地的 `HEALTH_PORT` (如 3000)。由於健康檢查只需在伺服器本機內網執行（127.0.0.1），虛擬機的外網安全性群組**不需開放 3000 port**，確保系統安全。

### 第四步：CI/CD Pipeline 建置與遠端部署對接
依據 Jenkins 伺服器與 Docker 運行主機的實體關係，採用不同的對接操作：

* **情境 A：Jenkins 與 Docker 虛擬機在同一台機器上**
  * 舊專案 `Jenkinsfile` 所採用的模式。Jenkins 直接在本地執行 `docker build` 並透過 `docker run -d --network="host" --name container-name` 重啟容器即可。

* **情境 B：Jenkins 與 Docker 虛擬機為不同機器 (遠端部署，如 Jenkins 部署至 EC2)**
  * **操作步驟**：
    1. 在 Jenkins 憑證中新增 `SSH Username with private key`，儲存能登入運行虛擬機的 SSH Key（例如 `aws-ec2-key`）。
    2. 在 Jenkins 伺服器本地完成 `docker build` 後，將 Image 推送至私有 Registry (如 Docker Hub 或 AWS ECR)。
    3. 在 `Jenkinsfile` 的 Deploy 階段中，使用 `sshagent` 連線至目標 Docker 虛擬機，並拉取 Image 重啟：
       ```groovy
       stage('3. 遠端部署 (Deploy Remote)') {
           steps {
               sshagent(credentials: ['aws-ec2-key']) {
                   sh """
                   ssh -o StrictHostKeyChecking=no user@your-vm-ip "
                       docker login -u ... -p ... &&
                       docker pull your-repo/butaidcbot:${BRANCH_NAME} &&
                       docker rm -f butaidcbot-${BRANCH_NAME} || true &&
                       docker run -d \
                           --name butaidcbot-${BRANCH_NAME} \
                           --env-file ... \
                           --network='host' \
                           --restart unless-stopped \
                           your-repo/butaidcbot:${BRANCH_NAME}
                   "
                   """
               }
           }
       }
       ```
    4. 部署後，Jenkins 即可利用 SSH 進入虛擬機執行健康檢查。

