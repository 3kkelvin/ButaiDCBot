# Timeout 系統指令說明文件

本系統提供單頻道禁言、全服監獄與隔離處置，以及權限與時間限制的設定功能。

---

## 一、 單頻道禁言群組 (single)

主要用於當前文字頻道的發言處罰與管理。

### 1. `/timeout single set`
* **功能說明**：在當前頻道禁言指定成員。
* **使用權限**：具備當前頻道禁言管理權限之身分組。
* **指令參數**：
  * `user` (使用者) **[必填]**：目標成員。
  * `minutes` (整數) **[必填]**：禁言時間 (分鐘，最小值為 1)。
  * `warned` (字串) **[必填]**：是否已警告 (必須填寫 `是`)。
  * `reason` (字串) **[必填]**：禁言原因。
* **使用範例**：
  ```
  /timeout single set user:@使用者 minutes:10 warned:是 reason:洗頻發言
  ```

### 2. `/timeout single release`
* **功能說明**：手動解除指定成員在當前頻道的禁言狀態。
* **使用權限**：具備當前頻道禁言管理權限之身分組。
* **指令參數**：
  * `user` (使用者) **[必填]**：目標成員。
* **使用範例**：
  ```
  /timeout single release user:@使用者
  ```

### 3. `/timeout single list`
* **功能說明**：檢視當前頻道內所有被禁言的成員名單與預計解禁時間。
* **使用權限**：全體成員皆可使用。
* **指令參數**：無。
* **使用範例**：
  ```
  /timeout single list
  ```

---

## 二、 全服監獄與隔離群組 (global)

主要用於全伺服器層級的關押處置或特殊隔離。

### 1. `/timeout global set`
* **功能說明**：將指定成員全服關押至監獄或進行特殊隔離，並暫時移除原身分組。
* **使用權限**：具備全域禁言管理權限之身分組。
* **指令參數**：
  * `user` (使用者) **[必填]**：目標成員。
  * `minutes` (整數) **[必填]**：關押時間 (分鐘，最小值為 1)。
  * `type` (選項) **[必填]**：
    * `關押 (Prisoner)`：標準全服監獄關押。
    * `特殊隔離 (Special)`：特殊隔離處置。
  * `warned` (字串) **[必填]**：是否已警告 (必須填寫 `是`)。
  * `reason` (字串) **[必填]**：關押原因。
* **使用範例**：
  ```
  /timeout global set user:@使用者 minutes:60 type:關押 (Prisoner) warned:是 reason:嚴重違反社群守則
  ```

### 2. `/timeout global release`
* **功能說明**：手動將指定成員從全服監獄中釋放，並還原其原始身分組。
* **使用權限**：具備全域禁言管理權限之身分組。
* **指令參數**：
  * `user` (使用者) **[必填]**：目標成員。
* **使用範例**：
  ```
  /timeout global release user:@使用者
  ```

### 3. `/timeout global list`
* **功能說明**：檢視全伺服器目前被關押或隔離的成員名單與剩餘時間。
* **使用權限**：全體成員皆可使用。
* **指令參數**：無。
* **使用範例**：
  ```
  /timeout global list
  ```

---

## 三、 系統配置與權限管理群組 (setting)

主要用於設定禁言時間上限與管理員身分組。

### 1. `/timeout setting limit`
* **功能說明**：設定單頻道禁言或全服監獄的時間上限。
* **使用權限**：僅限技術公務員。
* **指令參數**：
  * `scope` (選項) **[必填]**：
    * `單頻道禁言 (Single)`
    * `全服丟監獄 (Global)`
  * `minutes` (整數) **[必填]**：最高時間上限 (分鐘)。
* **使用範例**：
  ```
  /timeout setting limit scope:單頻道禁言 (Single) minutes:120
  ```

### 2. `/timeout setting set_global_admin`
* **功能說明**：新增全域管理權限身分組 (可使用 `global` 與 `single` 相關指令)。
* **使用權限**：僅限技術公務員。
* **指令參數**：
  * `role` (身分組) **[必填]**：目標身分組。
* **使用範例**：
  ```
  /timeout setting set_global_admin role:@執法組
  ```

### 3. `/timeout setting remove_global_admin`
* **功能說明**：移除全域管理權限身分組。
* **使用權限**：僅限技術公務員。
* **指令參數**：
  * `role` (身分組) **[必填]**：目標身分組。
* **使用範例**：
  ```
  /timeout setting remove_global_admin role:@執法組
  ```

### 4. `/timeout setting set_single_admin`
* **功能說明**：新增當前頻道的單頻道管理權限身分組。
* **使用權限**：僅限技術公務員。
* **指令參數**：
  * `role` (身分組) **[必填]**：目標身分組。
* **使用範例**：
  ```
  /timeout setting set_single_admin role:@頻道管理員
  ```

### 5. `/timeout setting remove_single_admin`
* **功能說明**：移除當前頻道的單頻道管理權限身分組。
* **使用權限**：僅限技術公務員。
* **指令參數**：
  * `role` (身分組) **[必填]**：目標身分組。
* **使用範例**：
  ```
  /timeout setting remove_single_admin role:@頻道管理員
  ```

### 6. `/timeout setting view_config`
* **功能說明**：檢視目前伺服器的時間限制、全域管理員身分組及當前頻道的管理員身分組配置。
* **使用權限**：僅限技術公務員。
* **指令參數**：無。
* **使用範例**：
  ```
  /timeout setting view_config
  ```
