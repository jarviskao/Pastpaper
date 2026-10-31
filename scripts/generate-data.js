/**
 * scripts/generate-data.js
 * Scans the Paper/ folder to dynamically discover exam years, questions, and options.
 * Naming convention:
 *   _0 : Question image
 *   _1 : Option A
 *   _2 : Option B
 *   _3 : Option C
 *   _4 : Option D
 * Integrates answers/explanations from data/answers.json and OCR text from data/ocr.json.
 * Produces data/papers.json for client-side search and quiz consumption.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PAPER_DIR = path.join(ROOT_DIR, 'Paper');
const ANSWERS_FILE = path.join(ROOT_DIR, 'data', 'answers.json');
const OCR_FILE = path.join(ROOT_DIR, 'data', 'ocr.json');
const OUTPUT_FILE = path.join(ROOT_DIR, 'data', 'papers.json');

/**
 * Normalizes Chinese text spacing while strictly preserving English identifiers and formulas.
 * @param {string} str
 * @returns {string} Cleaned text
 */
function cleanOcrText(str) {
    if (!str) return '';
    let s = str;

    // Unicode ranges: CJK Unified Ideographs (\u4e00-\u9fff) & Extension A (\u3400-\u4dbf)
    const hanChar = '[\\u4e00-\\u9fff\\u3400-\\u4dbf]';
    const hanRegex = new RegExp(`(${hanChar})\\s+(${hanChar})`, 'u');

    while (hanRegex.test(s)) {
        s = s.replace(new RegExp(`(${hanChar})\\s+(${hanChar})`, 'gu'), '$1$2');
    }

    const punct = '[，。、？！（）《》：；“”‘’()]';
    s = s.replace(new RegExp(`(${hanChar})\\s+(${punct})`, 'gu'), '$1$2')
         .replace(new RegExp(`(${punct})\\s+(${hanChar})`, 'gu'), '$1$2');

    return s.trim();
}

/**
 * Build the complete papers dataset.
 * @param {Object} [options]
 * @param {boolean} [options.silent=false]
 * @returns {Object} Generated papers payload
 */
function buildData(options = {}) {
    const silent = Boolean(options.silent);
    if (!silent) console.log('[generate-data] Scanning Paper directory:', PAPER_DIR);

    if (!fs.existsSync(PAPER_DIR)) {
        console.error('Error: Paper directory not found at', PAPER_DIR);
        process.exit(1);
    }

    let answersDb = {};
    if (fs.existsSync(ANSWERS_FILE)) {
        try {
            answersDb = JSON.parse(fs.readFileSync(ANSWERS_FILE, 'utf-8'));
            if (!silent) console.log('[generate-data] Loaded answers for', Object.keys(answersDb).length, 'years');
        } catch (e) {
            console.warn('[generate-data] Could not parse answers.json:', e.message);
        }
    }

    let ocrDb = {};
    if (fs.existsSync(OCR_FILE)) {
        try {
            let raw = fs.readFileSync(OCR_FILE, 'utf-8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            ocrDb = JSON.parse(raw);
            if (!silent) console.log('[generate-data] Loaded OCR text for', Object.keys(ocrDb).length, 'questions');
        } catch (e) {
            console.warn('[generate-data] Could not parse ocr.json:', e.message);
        }
    }

    const yearDirs = fs.readdirSync(PAPER_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && /^\d{4}$/.test(dirent.name))
        .map(dirent => dirent.name)
        .sort((a, b) => Number(b) - Number(a)); // Descending: 2025 -> 2005

    if (!silent) console.log(`[generate-data] Discovered ${yearDirs.length} exam years:`, yearDirs.join(', '));

    const papers = {};
    let totalQuestionsAll = 0;

    for (const year of yearDirs) {
        const yearPath = path.join(PAPER_DIR, year);
        const files = fs.readdirSync(yearPath);

        const questionMap = new Map();
        const fileRegex = /^(\d{4})_q_(\d+)_(\d+)\.(png|jpg|jpeg|webp)$/i;

        for (const file of files) {
            const match = file.match(fileRegex);
            if (!match) continue;

            const [, , qNumStr, partStr] = match;
            const qNum = parseInt(qNumStr, 10);
            const part = parseInt(partStr, 10);
            const relativePath = `Paper/${year}/${file}`;

            if (!questionMap.has(qNum)) {
                questionMap.set(qNum, {
                    qNum,
                    qNumDisplay: qNumStr,
                    questionImg: null,
                    optionsMap: new Map()
                });
            }

            const qEntry = questionMap.get(qNum);
            if (part === 0) {
                qEntry.questionImg = relativePath;
            } else {
                qEntry.optionsMap.set(part, relativePath);
            }
        }

        const sortedQNums = Array.from(questionMap.keys()).sort((a, b) => a - b);
        const questions = [];

        for (let i = 0; i < sortedQNums.length; i++) {
            const qNum = sortedQNums[i];
            const qData = questionMap.get(qNum);
            const uid = `${year}_q_${qData.qNumDisplay}`;

            if (!qData.questionImg) {
                console.warn(`[generate-data] Warning: Question image missing for ${year} Q${qNum}`);
                continue;
            }

            // Build options array (1 -> A, 2 -> B, 3 -> C, 4 -> D)
            const optionParts = Array.from(qData.optionsMap.keys()).sort((a, b) => a - b);
            const options = optionParts.map((part, optIdx) => {
                const letter = String.fromCharCode(65 + optIdx);
                return {
                    id: `${year}_q_${qData.qNumDisplay}_opt_${optIdx}`,
                    letter,
                    part,
                    img: qData.optionsMap.get(part)
                };
            });

            // Look up answer and explanation
            const yearAnswers = answersDb[year] || {};
            const qAnsInfo = yearAnswers[String(qNum)] || null;

            const correctAnswer = qAnsInfo ? qAnsInfo.answer : -1;
            const explanation = qAnsInfo && qAnsInfo.explanation ? qAnsInfo.explanation : '';

            // Look up OCR text
            const qOcrInfo = ocrDb[uid] || null;
            let ocrQuestionText = '';
            let ocrOptionsText = '';

            if (qOcrInfo) {
                ocrQuestionText = cleanOcrText(qOcrInfo.question || '');
                if (qOcrInfo.options) {
                    ocrOptionsText = Object.entries(qOcrInfo.options)
                        .map(([k, v]) => `${k}:${cleanOcrText(v)}`)
                        .join(' ');
                }
            }

            // Combined search index string
            const searchText = [
                year,
                `q${qNum}`,
                `第${qNum}題`,
                qData.qNumDisplay,
                ocrQuestionText,
                ocrOptionsText,
                explanation
            ].join(' ').toLowerCase();

            questions.push({
                uid,
                year,
                qNum,
                qNumDisplay: qData.qNumDisplay,
                paperIndex: i, // 0-based index in paper
                questionImg: qData.questionImg,
                options,
                answer: correctAnswer,
                answerLetter: correctAnswer >= 0 ? String.fromCharCode(65 + correctAnswer) : '',
                explanation,
                ocrText: {
                    question: ocrQuestionText,
                    options: ocrOptionsText
                },
                searchText
            });
        }

        const isDse = Number(year) >= 2012;
        const examLabel = isDse ? `HKDSE ${year}` : `HKCEE ${year}`;

        papers[year] = {
            year,
            label: examLabel,
            category: isDse ? 'HKDSE' : 'HKCEE',
            totalQuestions: questions.length,
            questions
        };

        totalQuestionsAll += questions.length;
        if (!silent) console.log(`[generate-data] ${year} (${examLabel}): ${questions.length} questions parsed`);
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        totalYears: yearDirs.length,
        totalQuestions: totalQuestionsAll,
        years: yearDirs,
        papers
    };

    const outDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload), 'utf-8');
    if (!silent) console.log(`[generate-data] Summary: ${yearDirs.length} years, ${totalQuestionsAll} questions total.`);

    return payload;
}

if (require.main === module) {
    buildData();
}

module.exports = {
    buildData,
    cleanOcrText
};
