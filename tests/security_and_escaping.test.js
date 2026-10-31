/**
 * tests/security_and_escaping.test.js
 * Automated unit testing for XSS mitigation, HTML entity escaping,
 * mathematical inequality protection, and keyword highlighting.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

function run() {
    console.log('[Test: Security & Escaping] Starting verification...');

    // Mock global browser context
    global.window = global;
    global.localStorage = {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; }
    };

    require(path.resolve(__dirname, '../js/ui.js'));
    const { UI } = global;

    // 1. Basic Escaping
    assert.strictEqual(UI.escapeHtml('<script>'), '&lt;script&gt;');
    assert.strictEqual(UI.escapeHtml('A & B'), 'A &amp; B');
    assert.strictEqual(UI.escapeHtml('"quote" and \'single\''), '&quot;quote&quot; and &#39;single&#39;');

    // 2. Algorithm and Math Formula Protection
    const math1 = '當 N < 14 執行';
    assert.strictEqual(UI.escapeHtml(math1), '當 N &lt; 14 執行');

    const math2 = 'WHERE Choice <> \'Q\'';
    assert.strictEqual(UI.escapeHtml(math2), 'WHERE Choice &lt;&gt; &#39;Q&#39;');

    const math3 = '如果 (i <= 4) AND (score >= 50)';
    assert.strictEqual(UI.escapeHtml(math3), '如果 (i &lt;= 4) AND (score &gt;= 50)');

    // 3. Highlight Keywords Safety
    const rawText = '如果 i < 5 則輸出 CPU 狀態';
    const escapedText = UI.escapeHtml(rawText);
    const highlighted = UI.highlightKeywords(escapedText, 'CPU');

    assert(highlighted.includes('<mark class="bg-amber-200 text-amber-950 font-bold px-1 rounded">CPU</mark>'));
    assert(highlighted.includes('&lt; 5')); // Math formula preserved!

    // Multi-token highlight regression test (must not corrupt <mark> tag attributes or HTML entities)
    const multiRaw = '當 a < b 且 class 與 mark 變數存在時，執行 rounded 函數 & 輸出';
    const multiEscaped = UI.escapeHtml(multiRaw);
    const multiHighlighted = UI.highlightKeywords(multiEscaped, 'CPU mark class rounded lt amp');
    assert(!multiHighlighted.includes('<<mark'), 'Must not nest or corrupt <mark> tag names');
    assert(multiHighlighted.includes('&lt;'), 'HTML entity &lt; must remain intact even when searching "lt"');
    assert(multiHighlighted.includes('&amp;'), 'HTML entity &amp; must remain intact even when searching "amp"');

    // 4. Test real questions from papers.json that contain < or >
    const rawData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/papers.json'), 'utf8'));
    let formulaQuestionCount = 0;

    for (const yr of rawData.years) {
        for (const q of rawData.papers[yr].questions) {
            const qText = q.ocrText?.question || '';
            if (qText.includes('<') || qText.includes('>')) {
                formulaQuestionCount++;
                const escaped = UI.escapeHtml(qText);
                assert(!escaped.includes('< ') && !escaped.includes('<1') && !escaped.includes('<='),
                    `Question ${q.uid} raw < should be escaped to &lt;`);
            }
        }
    }

    assert(formulaQuestionCount >= 35, `Should detect at least 35 questions containing inequality symbols, found ${formulaQuestionCount}`);

    console.log(`[Test: Security & Escaping] PASS: ${formulaQuestionCount} inequality formula questions verified immune to DOM parsing corruption.`);
}

module.exports = { run };

if (require.main === module) {
    run();
}
