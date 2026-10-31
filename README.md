# ICT 歷年 MC 試題庫 (ICT Past Paper Learning Platform)

最強香港中學文憑試 (HKDSE) 及會考 (HKCEE) 資訊及通訊科技科 (ICT) 歷年 MC 試題庫與在線學習平台。支援即時練習、計時模擬考試、自訂組卷、錯題重溫、收藏與離線 PWA。

支援電腦端（寬螢幕側欄導覽）與手機端（底部快捷工具列、側滑導覽抽屜、安全區適配）。

---

## 🌟 核心特點

1. **純圖片試卷架構 (免依賴 XML)**
   - 全面擺脫舊版 `ict-mc.xml`，直接以 `Paper/` 資料夾內的高解析度試題原圖建構。
   - 年份、題號與題目數量完全由 `Paper/` 資料夾動態決定（例如：2005 年 39 題、2025 年 40 題等）。
2. **三種學習模式**
   - ⚡ **即時練習模式**：點擊選項即時判定對錯、震動反饋、展示正確答案與詳細中文題解。
   - 📝 **模擬考試模式**：全真計時模擬，作答過程不揭曉答案，交卷後自動計算準確率並預測 DSE 等級（Level 1 至 Level 5**）。
   - 📖 **溫習背題模式**：直接顯示答案與完整題解，適合考前快速複習。
3. **自訂模擬試卷 (Custom Exam)**
   - 自由勾選歷年年份組合。
   - 設定組卷題數（10 ~ 60 題）。
   - 支援打亂題目順序與打亂選項次序（A/B/C/D）。
4. **錯題本與星號收藏**
   - ❌ **錯題重溫**：自動收集答錯題目，針對弱點反覆練習。
   - ⭐ **星號收藏**：一鍵標記經典或疑難題目。
5. **圖片放大檢視 (Lightbox)**
   - 點擊任意題目或選項圖片，即可全螢幕高清縮放檢視，不怕圖表或字體太小。
6. **OCR 全文檢索與關鍵字審查**
   - 完整提取題目與選項圖片之文字（支援中英文、試算表公式與專業術語），離線預建索引（835 題題幹與 3340 個選項 100% 覆蓋）。
   - 支援即時關鍵字查詢、跨年份全庫搜尋（秒級檢索與即時作答）、單趟安全高亮命中字眼與文字審查折疊區。
7. **電腦與手機自適應 (RWD & PWA)**
   - 電腦端：左側常駐導覽列、計時卡片、鍵盤快捷鍵（`j` / `k` 上下題跳轉、`Esc` 關閉視窗）。
   - 手機端：底部浮動導覽列、滑動抽屜式題號導覽、觸控防手震。
   - 支援 Service Worker v5 離線快取與添加到手機主畫面。
---

## 📁 檔案命名規範

所有試題圖片統一存放於 `Paper/{年份}/` 資料夾：

- `_0`：題目本文／圖表（例如：`2023_q_01_0.png`）
- `_1`：選項 A（例如：`2023_q_01_1.png`）
- `_2`：選項 B（例如：`2023_q_01_2.png`）
- `_3`：選項 C（例如：`2023_q_01_3.png`）
- `_4`：選項 D（例如：`2023_q_01_4.png`）

---

## 🏗️ 專案架構

```text
├── index.html                  # 核心頁面入口 (輕量簡潔語意化 HTML，支援無障礙 WCAG)
├── manifest.json               # PWA 設定檔 (支援可安裝 Web App 與獨立視窗)
├── sw.js                       # Service Worker v5 (離線快取、圖片優先與離線標準 Response 防護)
├── icons/                      # PWA 與高解析度應用圖示
│   └── icon.svg
├── css/
│   └── app.css                 # 介面樣式、極簡輕量 UI、防抖觸控、動態過渡
├── js/
│   ├── store.js                # 狀態集中管理、防禦性 Storage、題號智能搜尋、錯題隔離
│   ├── quiz.js                 # 測驗邏輯、無飄移精確計時器、DSE 評級算法、自訂組卷引擎
│   ├── ui.js                   # DOM 渲染、XSS 防禦與符號轉義、題號導航、燈箱縮放、Toast 通知
│   └── app.js                  # 應用生命週期、防誤觸交卷、鍵盤導航快捷鍵、安全備份匯入匯出
├── data/
│   ├── papers.json             # 由腳本自動掃描 Paper 資料夾生成之題庫中繼檔
│   ├── answers.json            # 歷年官方答案與詳細中文題解資料庫 (835 題 100% 覆蓋)
│   └── ocr.json                # 全庫 4175 張試題與選項圖片之 OCR 識別文字數據
├── tests/                      # 全維度自動化驗證套件 (2026-2027+)
│   ├── run_all_tests.js        # 主測試執行器 (Master Test Runner)
│   ├── data_integrity.test.js  # 題庫資料完整性與 4175 張圖片實體校驗
│   ├── quiz_engine.test.js     # 測驗評分、DSE 等級邊界值與計時器校準測試
│   ├── store_and_search.test.js# 智能搜尋 (精確題號/複合查詢/跨年份) 測試
│   ├── security_and_escaping.test.js # XSS 防禦與數學符號 (<, >) 安全轉義測試
│   └── pwa_and_offline.test.js # PWA 清單、離線快取規則與無障礙標準測試
├── Paper/                      # 試卷圖片資源 (2005 - 2025)
│   ├── 2005/
│   └── ...
├── scripts/
│   ├── generate-data.js        # 自動掃描 Paper/ 並產出 data/papers.json 的腳本
│   ├── serve.js                # 零依賴本地靜態 HTTP 預覽伺服器 (內建路徑穿越防護)
│   └── run-ocr.ps1             # 批次 OCR 識別腳本 (提取題目與選項文字)
└── .github/
    └── workflows/
        └── update-paper-data.yml # GitHub Actions 自動更新試題資料與 CI 自動化驗證工作流
```

---

## 🌐 完整部署方式 (Deployment Guide)

本專案採用 **零第三方執行期依賴 (Zero Runtime Dependencies)** 的純靜態架構，可無縫部署於任何靜態託管平台或自建伺服器：

### 方式一：GitHub Pages 自動化部署（推薦）
1. 將專案推送至 GitHub 儲存庫（Repository）。
2. 進入 GitHub 儲存庫的 **Settings → Pages**。
3. 於 **Build and deployment** 下：
   - **Source** 選擇 `Deploy from a branch`。
   - **Branch** 選擇 `main`（或 `master`）及 `/ (root)`，點擊 **Save**。
4. 若使用自訂網域，直接修改根目錄 [`CNAME`](CNAME) 檔案內容為你的網域名稱（目前設定為 `ict.imnko.eu.org`），並於 DNS 服務商設定指向 GitHub Pages 的 CNAME 紀錄。

### 方式二：Cloudflare Pages / Vercel / Netlify 部署
1. 於平台匯入 Git 儲存庫。
2. 設定建置參數：
   - **Build command（建置指令）**：`node scripts/generate-data.js && node tests/run_all_tests.js`
   - **Build output directory（輸出目錄）**：`.`（專案根目錄）
   - **Node.js 版本**：`18.x` 或 `20.x` 以上。

### 方式三：本地或自建伺服器部署 (Node.js / Nginx / Docker)
- **使用內建零依賴伺服器啟動**：
  ```bash
  node scripts/serve.js
  # 預設監聽 http://127.0.0.1:4173/ (可透過環境變數 PORT=8080 自訂連接埠)
  ```
- **使用 Nginx / Apache / Caddy**：
  直接將網站根目錄（Document Root）指向專案目錄，無需任何後端編譯。

---

## 🔄 版本與題庫更新方法 (Update & Maintenance Guide)

### 情境 A：新增未來年份試卷（例如 2026、2027 年）
1. **放入試題圖片**：建立 `Paper/2026/` 資料夾，依命名規範放入圖片（`2026_q_01_0.png` 題幹、`_1`~`_4` 選項 A~D）。
2. **補充答案與詳解**：於 `data/answers.json` 新增 `"2026"` 鍵值及各題 `answer`（`0`=A, `1`=B, `2`=C, `3`=D）與 `explanation` 解析。
3. **提取 OCR 檢索文字（選用）**：於 Windows 執行 `powershell -ExecutionPolicy Bypass -File scripts/run-ocr.ps1` 自動識別圖片文字並更新 `data/ocr.json`。
4. **重新生成題庫並執行自動化驗證**：
   ```bash
   node scripts/generate-data.js
   node tests/run_all_tests.js
   ```
5. **推送自動部署**：將變更 commit 並 push 至 GitHub，GitHub Actions（`.github/workflows/update-paper-data.yml`）會自動完成建構、全維度測試與線上發佈。

### 情境 B：發佈程式碼或介面更新（PWA 快取升級）
1. 修改前端程式碼（`js/`、`css/`、`index.html`）。
2. 更新 `sw.js` 中的快取版本常數（例如將 `CACHE_NAME` 由 `'ict-master-v5'` 遞增為 `'ict-master-v6'`），確保全球用戶端瀏覽器在下次開啟時自動清除舊版快取並提示套用新版本。
3. 更新 `package.json` 中的 `version` 版本號。
4. 執行 `node tests/run_all_tests.js` 確認 5 大驗證套件 100% 通過後推送上線。

## 📄 授權

此專案僅供教育學習與個人複習使用。
