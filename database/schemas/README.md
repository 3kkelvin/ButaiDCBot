# Database Schemas Directory

此目錄用於放置 Supabase / PostgreSQL 資料庫自動建表與遷移腳本 (`.sql` 檔案)。

> 註：目前全域快取 (Caches) 與分散式互斥鎖 (Distributed Locks) 已重構為使用 **Redis**，故本目錄暫無 SQL 建表檔。
> 日後若有其他業務資料庫需求，可直接新增 `.sql` 檔至此目錄，系統開機時會自動載入並執行。
