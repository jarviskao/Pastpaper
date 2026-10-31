/**
 * tests/data_integrity.test.js
 * Comprehensive automated verification for data/papers.json, answers.json,
 * ocr.json, and all physical past paper question/option images.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function run() {
    console.log('[Test: Data Integrity] Starting verification...');

    const rootDir = path.resolve(__dirname, '..');
    const papersPath = path.join(rootDir, 'data', 'papers.json');
    const answersPath = path.join(rootDir, 'data', 'answers.json');
    const ocrPath = path.join(rootDir, 'data', 'ocr.json');

    // 1. Files existence & valid JSON syntax
    assert(fs.existsSync(papersPath), 'data/papers.json must exist');
    assert(fs.existsSync(answersPath), 'data/answers.json must exist');
    assert(fs.existsSync(ocrPath), 'data/ocr.json must exist');

    const papersData = JSON.parse(fs.readFileSync(papersPath, 'utf8'));
    const answersData = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
    const ocrData = JSON.parse(fs.readFileSync(ocrPath, 'utf8'));

    // 2. High-level dataset metadata (supports 2005-2025 baseline and future 2026+ expansion)
    assert.strictEqual(typeof papersData.generatedAt, 'string');
    assert(papersData.totalYears >= 21, `Must have at least 21 exam years, got ${papersData.totalYears}`);
    assert(papersData.totalQuestions >= 835, `Total questions across all years must be >= 835, got ${papersData.totalQuestions}`);
    assert.strictEqual(papersData.years.length, papersData.totalYears, 'Years array length must match totalYears');
    // 3. Deep Question & Physical Image verification
    let questionCounter = 0;
    let missingImages = 0;
    let missingAnswers = 0;
    let invalidOptionCounts = 0;

    for (const yr of papersData.years) {
        const paper = papersData.papers[yr];
        assert(paper, `Paper object for year ${yr} must exist`);
        assert(paper.questions && Array.isArray(paper.questions), `Year ${yr} must have questions array`);

        questionCounter += paper.questions.length;

        for (let i = 0; i < paper.questions.length; i++) {
            const q = paper.questions[i];

            // Basic question structure
            assert(q.uid, `Question at index ${i} in ${yr} must have a uid`);
            assert.strictEqual(q.year, yr, `Question ${q.uid} year must match ${yr}`);
            assert(typeof q.qNum === 'number' && q.qNum > 0, `Question ${q.uid} must have positive qNum`);

            // Image verification
            const qImgPath = path.join(rootDir, q.questionImg);
            if (!fs.existsSync(qImgPath) || fs.statSync(qImgPath).size === 0) {
                console.error(`[Data Integrity Error] Missing question image: ${q.questionImg}`);
                missingImages++;
            }

            // Options verification
            if (!q.options || q.options.length !== 4) {
                console.error(`[Data Integrity Error] Question ${q.uid} does not have exactly 4 options`);
                invalidOptionCounts++;
            } else {
                for (let optIdx = 0; optIdx < 4; optIdx++) {
                    const opt = q.options[optIdx];
                    assert.strictEqual(opt.letter, String.fromCharCode(65 + optIdx));
                    assert.strictEqual(opt.part, optIdx + 1);

                    const optImgPath = path.join(rootDir, opt.img);
                    if (!fs.existsSync(optImgPath) || fs.statSync(optImgPath).size === 0) {
                        console.error(`[Data Integrity Error] Missing option image: ${opt.img}`);
                        missingImages++;
                    }
                }
            }

            // Answers verification
            if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
                console.error(`[Data Integrity Error] Question ${q.uid} has invalid answer index: ${q.answer}`);
                missingAnswers++;
            }
            assert(['A', 'B', 'C', 'D'].includes(q.answerLetter), `Question ${q.uid} answerLetter must be A/B/C/D`);

            // Search text verification
            assert(q.searchText && q.searchText.length > 0, `Question ${q.uid} must have non-empty searchText`);

            // OCR verification
            assert(q.ocrText, `Question ${q.uid} must have ocrText object`);
        }
    }

    assert.strictEqual(questionCounter, papersData.totalQuestions, `Total verified questions must match ${papersData.totalQuestions}`);
    assert.strictEqual(Object.keys(ocrData).length, papersData.totalQuestions, 'OCR database entry count must match totalQuestions');
    assert.strictEqual(missingImages, 0, 'Must have zero missing physical image assets');
    assert.strictEqual(missingAnswers, 0, 'Must have zero missing or out-of-bounds answers');
    assert.strictEqual(invalidOptionCounts, 0, 'All questions must have exactly 4 options');

    console.log(`[Test: Data Integrity] PASS: ${papersData.totalYears} years, ${questionCounter} questions, ${questionCounter * 5} images verified successfully.`);
}

module.exports = { run };

if (require.main === module) {
    run();
}
