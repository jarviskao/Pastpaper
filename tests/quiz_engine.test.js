/**
 * tests/quiz_engine.test.js
 * Automated unit testing for Quiz grading cutoffs, precision timer,
 * custom exam generation, and answer scoring.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

function run() {
    console.log('[Test: Quiz Engine] Starting verification...');

    // Mock global browser context
    global.window = global;
    global.navigator = { vibrate: () => true };
    global.localStorage = {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; }
    };

    // Load store & quiz
    require(path.resolve(__dirname, '../js/store.js'));
    require(path.resolve(__dirname, '../js/quiz.js'));

    const { Store, Quiz } = global;

    // 1. Grade Prediction cutoffs
    const g5s2 = Quiz.predictGrade(35, 40); // 87.5%
    assert.strictEqual(g5s2.level, 'Level 5**');

    const g5s1 = Quiz.predictGrade(32, 40); // 80.0%
    assert.strictEqual(g5s1.level, 'Level 5*');

    const g5 = Quiz.predictGrade(28, 40); // 70.0%
    assert.strictEqual(g5.level, 'Level 5');

    const g4 = Quiz.predictGrade(24, 40); // 60.0%
    assert.strictEqual(g4.level, 'Level 4');

    const g3 = Quiz.predictGrade(20, 40); // 50.0%
    assert.strictEqual(g3.level, 'Level 3');

    const g2 = Quiz.predictGrade(16, 40); // 40.0%
    assert.strictEqual(g2.level, 'Level 2');

    const g1 = Quiz.predictGrade(12, 40); // 30.0%
    assert.strictEqual(g1.level, 'Level 1 / U');

    const gZero = Quiz.predictGrade(0, 0);
    assert.strictEqual(gZero.level, 'Level 1');

    // 2. Precision Timer formatTime
    assert.strictEqual(Quiz.formatTime(0), '00:00');
    assert.strictEqual(Quiz.formatTime(59), '00:59');
    assert.strictEqual(Quiz.formatTime(60), '01:00');
    assert.strictEqual(Quiz.formatTime(125), '02:05');
    assert.strictEqual(Quiz.formatTime(3600), '60:00');

    // 3. Array Shuffle integrity
    const originalArr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = Quiz.shuffleArray([...originalArr]);
    assert.strictEqual(shuffled.length, originalArr.length);
    assert.deepStrictEqual([...shuffled].sort((a, b) => a - b), originalArr);

    // 4. Custom Exam Generator
    const rawData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/papers.json'), 'utf8'));
    Store.setData(rawData);

    const generated = Quiz.generateCustomExam({
        selectedYears: ['2024', '2023'],
        count: 20,
        shuffleQ: true,
        shuffleO: true
    });

    assert.strictEqual(generated, true);
    assert.strictEqual(Store.isCustomMode, true);
    assert.strictEqual(Store.currentYear, 'custom');
    assert.strictEqual(Store.customQuestionSet.length, 20);

    // Verify option shuffle relabeling
    Store.customQuestionSet.forEach((q, idx) => {
        assert.strictEqual(q.customIndex, idx);
        assert.strictEqual(q.options.length, 4);
        assert.strictEqual(q.options[0].letter, 'A');
        assert.strictEqual(q.options[1].letter, 'B');
        assert.strictEqual(q.options[2].letter, 'C');
        assert.strictEqual(q.options[3].letter, 'D');
        assert.strictEqual(q.optionsShuffled, true);
    });

    // 5. Cross-Year Search Option Click
    Store.isCustomMode = false;
    Store.currentYear = '2025';
    Store.mode = 'practice';
    Store.searchScope = 'all';
    Store.resetQuizState();

    const target2020Q1 = Store.getAllQuestions().find(q => q.uid === '2020_q_01');
    assert(target2020Q1, '2020_q_01 must exist');
    Quiz.handleOptionClick('2020_q_01', target2020Q1.answer);
    assert(Store.userAnswers['2020_q_01'], 'Cross-year question answer must be recorded');
    assert.strictEqual(Store.userAnswers['2020_q_01'].isCorrect, true);

    // Cleanup timer handle
    Quiz.stopTimer();

    console.log('[Test: Quiz Engine] PASS: Grade prediction, time formatting, cross-year answering, and exam generator verified.');
}

module.exports = { run };

if (require.main === module) {
    run();
}
