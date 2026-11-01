/**
 * tests/store_and_search.test.js
 * Automated unit testing for Store state hydration, smart question-number queries,
 * compound searches, OCR text filtering, and wrong-questions reset.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

function run() {
    console.log('[Test: Store & Search] Starting verification...');

    // Mock global browser context
    global.window = global;
    global.localStorage = {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; }
    };

    require(path.resolve(__dirname, '../js/store.js'));
    const { Store } = global;

    const rawData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/papers.json'), 'utf8'));
    Store.setData(rawData);

    // 1. Initial State
    assert.strictEqual(Store.years.length, 21);
    assert.strictEqual(Store.currentYear, '2025');

    // 2. Pure Question Number Queries (Case A)
    Store.currentYear = '2024';
    Store.searchScope = 'current';

    // Query "15" -> should ONLY match Q15 in 2024 (1 question), NOT all questions containing "15"
    Store.searchKeyword = '15';
    let res = Store.getDisplayQuestions();
    assert.strictEqual(res.length, 1, `Searching "15" in 2024 paper should match exactly 1 question, got ${res.length}`);
    assert.strictEqual(res[0].qNum, 15);

    // Query "q5" -> should match Q5
    Store.searchKeyword = 'q5';
    res = Store.getDisplayQuestions();
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].qNum, 5);

    // Query "第12題" -> should match Q12
    Store.searchKeyword = '第12題';
    res = Store.getDisplayQuestions();
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].qNum, 12);

    // Cross-Year Query for Q1 (all 21 years have Q1 -> 21 questions)
    Store.searchScope = 'all';
    Store.searchKeyword = '1';
    res = Store.getDisplayQuestions();
    assert.strictEqual(res.length, 21, 'Cross-year search for "1" should find Q1 in all 21 years');

    // Cross-Year Query for Q15 (2008 Q15 was annulled by HKEAA, so 20 questions exist)
    Store.searchKeyword = '15';
    res = Store.getDisplayQuestions();
    assert.strictEqual(res.length, 20, 'Cross-year search for "15" should find Q15 in 20 valid papers');
    // 3. Compound Query: "2024 15"
    Store.searchKeyword = '2024 15';
    res = Store.getDisplayQuestions();
    assert.strictEqual(res.length, 1, 'Compound query "2024 15" should match exactly 2024 Q15');
    assert.strictEqual(res[0].uid, '2024_q_15');

    // 4. Keyword Query: "志明"
    Store.searchKeyword = '志明';
    res = Store.getDisplayQuestions();
    assert(res.length >= 20, `Keyword "志明" should hit at least 20 questions, got ${res.length}`);

    // Keyword Query: "試算表"
    Store.searchKeyword = '試算表';
    res = Store.getDisplayQuestions();
    assert(res.length >= 35, `Keyword "試算表" should hit at least 35 questions, got ${res.length}`);

    // 5. Starred Management
    assert.strictEqual(Store.isStarred('2024_q_01'), false);
    const starAdded = Store.toggleStar('2024_q_01');
    assert.strictEqual(starAdded, true);
    assert.strictEqual(Store.isStarred('2024_q_01'), true);

    const starRemoved = Store.toggleStar('2024_q_01');
    assert.strictEqual(starRemoved, false);
    assert.strictEqual(Store.isStarred('2024_q_01'), false);

    // 6. Reset Wrong Questions
    Store.currentYear = '2024';
    Store.searchScope = 'current';
    Store.searchKeyword = '';

    Store.userAnswers = {
        '2024_q_01': { isCorrect: true },
        '2024_q_02': { isCorrect: false },
        '2024_q_03': { isCorrect: false }
    };

    const resetCount = Store.resetWrongQuestions();
    assert.strictEqual(resetCount, 2, 'Should reset exactly the 2 wrong answers');
    assert.strictEqual(Store.userAnswers['2024_q_01'].isCorrect, true);
    assert.strictEqual(Store.userAnswers['2024_q_02'], undefined);
    assert.strictEqual(Store.userAnswers['2024_q_03'], undefined);
    // 7. Custom year reload fallback & score recalculation
    global.localStorage.setItem(Store.STORAGE_KEYS.YEAR, 'custom');
    Store.isCustomMode = false;
    Store.setData(rawData);
    assert.strictEqual(Store.currentYear, '2025', 'Reloading with saved "custom" year must safely fall back to newest year');

    Store.userAnswers = {
        '2025_q_01': { isCorrect: true },
        '2025_q_02': { isCorrect: false },
        '2025_q_03': { isCorrect: true },
        '2020_q_01': { isCorrect: true } // From another year (e.g. cross-year search)
    };
    assert.strictEqual(Store.recalculateScore(), 2, 'recalculateScore must only count current paper questions');


    // 8. Flexible Metadata Filters (Topic, Difficulty, Correct Rate)
    Store.searchScope = 'all';
    Store.resetFilters();
    assert.strictEqual(Store.getDisplayQuestions().length, 835);

    // Filter topic cit_4 (計算思維與程式編寫) -> 151 questions
    Store.setFilterTopic('cit_4');
    const cit4List = Store.getDisplayQuestions();
    assert.strictEqual(cit4List.length, 151, `Expected 151 cit_4 questions, got ${cit4List.length}`);
    cit4List.forEach(q => assert.strictEqual(q.topic.code, 'cit_4'));

    // Filter difficulty '3' (困難) -> should intersect with cit_4 (51 questions)
    Store.setFilterDifficulty('3');
    const hardCit4List = Store.getDisplayQuestions();
    assert.strictEqual(hardCit4List.length, 51, `Expected 51 hard cit_4 questions, got ${hardCit4List.length}`);
    hardCit4List.forEach(q => {
        assert.strictEqual(q.topic.code, 'cit_4');
        assert.strictEqual(q.difficulty.code, 3);
    });

    // Filter correct rate 'extreme' (<30%)
    Store.setFilterCorrectRate('extreme');
    const extremeList = Store.getDisplayQuestions();
    extremeList.forEach(q => {
        assert.strictEqual(q.topic.code, 'cit_4');
        assert.strictEqual(q.difficulty.code, 3);
        assert(q.correctRate < 30);
    });

    // Reset filters
    Store.resetFilters();
    assert.strictEqual(Store.getDisplayQuestions().length, 835);
    assert.strictEqual(Store.hasActiveFilters(), false);
    console.log('[Test: Store & Search] PASS: Search engine, question targeting, and state queries verified.');
}

module.exports = { run };

if (require.main === module) {
    run();
}
