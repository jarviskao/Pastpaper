/**
 * tests/run_all_tests.js
 * Master Multi-Dimensional Automated Verification Suite.
 * Executes all test modules and generates a clear structured health report.
 */

const path = require('path');

const testSuites = [
    { name: '1. 資料完整性與圖片資產驗證 (Data Integrity & Physical Assets)', file: './data_integrity.test.js' },
    { name: '2. 測驗引擎與計時算法驗證 (Quiz Engine, Cutoffs & Timer)', file: './quiz_engine.test.js' },
    { name: '3. 狀態管理與智能搜尋引擎驗證 (Store State & Smart Search)', file: './store_and_search.test.js' },
    { name: '4. XSS 防禦與數學符號安全轉義驗證 (Security, XSS & Math Escaping)', file: './security_and_escaping.test.js' },
    { name: '5. PWA 清單、離線快取與無障礙標準驗證 (PWA, Service Worker & A11y)', file: './pwa_and_offline.test.js' }
];

console.log('======================================================================');
console.log('🚀 ICT Past Paper Learning Platform - 全維度自動化驗證套件 (2026-2027+)');
console.log('======================================================================\n');

let passedCount = 0;
let failedCount = 0;
const startTime = Date.now();

for (const suite of testSuites) {
    console.log(`▶ 執行測試套件: ${suite.name}`);
    const t0 = Date.now();
    try {
        const mod = require(suite.file);
        if (typeof mod.run === 'function') {
            mod.run();
        }
        const duration = Date.now() - t0;
        console.log(`✔ [PASS] ${suite.name} (${duration}ms)\n`);
        passedCount++;
    } catch (err) {
        const duration = Date.now() - t0;
        console.error(`✖ [FAIL] ${suite.name} (${duration}ms)`);
        console.error(err.stack || err.message);
        console.log('');
        failedCount++;
    }
}

const totalDuration = Date.now() - startTime;
console.log('======================================================================');
console.log(`測試統計報告: 總計 ${testSuites.length} 套件 | 通過: ${passedCount} | 失敗: ${failedCount} | 耗時: ${totalDuration}ms`);
console.log('======================================================================');

if (failedCount > 0) {
    console.error('\n❌ 自動化驗證未全數通過，請檢視上方錯誤訊息！');
    process.exit(1);
} else {
    console.log('\n🌟 恭喜！專案全維度自動化測試 100% 通過，程式碼健康度維持卓越！');
    process.exit(0);
}
