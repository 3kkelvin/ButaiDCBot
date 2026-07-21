# Discord.js 互動與通訊技術開發手冊 (Discord Interaction Guide)

本手冊為 ButaiDCBot 的表現層 (Presentation Layer) 開發人員提供關於回覆權限、成員通知 @ 機制與私聊 (DM) 發送的實作規範。

---

## 1. 僅自己可見的文字框 (Ephemeral) vs 大家看得到的文字框 (Normal)

在 Discord Slash Commands 中，我們通常需要區分回覆是「僅發送指令的人自己看得見」還是「頻道內所有人都看得見」。

### A. 直接回覆時的區分
* **普通回覆 (Normal Response)**：
  ```typescript
  // 頻道內所有人皆可看見
  await interaction.reply({ content: '這是一條公開的訊息。', ephemeral: false });
  ```
* **僅自己可見 (Ephemeral Response)**：
  ```typescript
  // 只有發送指令的用戶本人看得見，且該訊息不會永久儲存於頻道中
  await interaction.reply({ content: '這是一條只有您自己能看見的私密訊息。', ephemeral: true });
  ```

### B. 搭配 Defer Reply (防止 3 秒超時)
如果指令內有耗時運算（如連線資料庫或外部 API），必須先呼叫 `deferReply` 來告訴 Discord 延遲回覆。**`ephemeral` 狀態必須在 `deferReply` 時就決定好，後續的 `editReply` 無法再行變更！**

* **公開 Defer 範例**：
  ```typescript
  // 1. 先宣告為公開
  await interaction.deferReply({ ephemeral: false });
  
  // 2. 進行耗時運算...
  
  // 3. 編輯回覆，這依然是公開的
  await interaction.editReply({ content: '耗時運算完畢！這是公開結果。' });
  ```
* **僅自己可見 Defer 範例 (以 /help 為例)**：
  ```typescript
  // 1. 先宣告為僅自己可見
  await interaction.deferReply({ ephemeral: true });
  
  // 2. 進行耗時運算...
  
  // 3. 編輯回覆，這依然是僅自己可見的
  await interaction.editReply({ content: '這是您的私密幫助選單。' });
  ```

---

## 2. 真的 @ 人 (有通知、紅點) vs 假 @ 人 (有高亮、無通知無紅點)

在文字過濾、簽到日誌或日常回覆中，我們時常需要提及用戶。但频繁的 @ 會造成用戶的紅點通知困擾，因此必須嚴格區分真假 @ 人。

### A. 真的 @ 人 (有通知、有紅點、發出音效)
當機器人發送重要警告、點名或需要強烈提醒用戶時使用。
* **實作原理**：使用 `<@用戶ID>` 格式，且**不要禁用** `allowedMentions` 的對應參數（Discord.js 預設是允許 mention 的）。
* **程式碼範例**：
  ```typescript
  // 假設要提及一個用戶 (userId: '1234567890')
  const userId = message.author.id;
  
  await message.channel.send({
    content: `📢 報告 <@${userId}>，您的假單已被核准！`, // 這會發出紅點與通知
  });
  ```

### B. 假 @ 人 (只在頻道顯示藍色暱稱高亮，但絕無紅點、無通知、無音效)
當我們在公共頻道做大量的統計、排版日誌，或像文字過濾器中「提及用戶發言」時使用，避免騷擾用戶。
* **實作原理**：使用 `<@用戶ID>` 格式，但在發送參數中**設定 `allowedMentions: { parse: [], users: [] }`**。這會告訴 Discord 僅做外觀高亮解析，但剝奪其產生 Ping 的權限。
* **程式碼範例 (以文字過濾為例)**：
  ```typescript
  const userId = message.author.id;
  
  await message.channel.send({
    content: `🙊 偵測到敏感詞，請注意發言禮貌喔 <@${userId}>！`,
    // 關鍵設定：限制提及權限，不解析任何 users 或 roles
    allowedMentions: { 
      parse: [],     // 不解析 roles, users, 或 everyone
      users: []      // 明確指定被提及的 user ID 列表為空
    }
  });
  ```

---

## 3. 機器人發送私信 (Direct Message, DM)

當需要向用戶發送隱私驗證碼、個別通知，或不便於公共頻道展示的資料時，應使用私訊功能。

### A. 實作原理
直接對 `User` 物件調用 `.send(...)` 方法。Discord.js 會自動在底層為機器人與該用戶建立 DM Channel 並發送訊息。

### B. 致命陷阱與 Fail-Safe 防禦
**重要！許多 Discord 用戶會在隱私設定中關閉「允許來自伺服器成員的私訊」。**
如果用戶關閉了私訊，當機器人嘗試 `user.send()` 時，Discord API 會直接拋出 `50007: Cannot send messages to this user` 錯誤。如果不加裝防禦，會導致整個監聽回呼崩潰。

* **安全防禦程式碼範例**：
  ```typescript
  const user = message.author; // 或是 interaction.user
  
  try {
    await user.send({
      content: '🔒 這是 ButaiDCBot 發送給您的私密驗證訊息，請勿洩漏給他人！',
    });
    console.log(`[DM] 成功向 ${user.tag} 發送私信。`);
  } catch (error: any) {
    // 50007 代表被對方拒絕私信，或是對方封鎖了機器人
    if (error.code === 50007) {
      console.warn(`[DM] 無法向 ${user.tag} 發送私信，對方關閉了私訊功能。`);
      
      // 改在公共頻道以「僅自己可見」或回覆形式告知對方
      if (message.channel) {
        await message.reply({
          content: '⚠️ 由於您的 Discord 隱私設定關閉了私訊，請開啟「允許來自伺服器成員的私訊」後重試。',
          allowedMentions: { repliedUser: true }
        });
      }
    } else {
      // 其他 API 錯誤向上拋出，交由全域錯誤監控捕獲
      throw error;
    }
  }
  ```
