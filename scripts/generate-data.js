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
const METADATA_FILE = path.join(ROOT_DIR, 'data', 'metadata.json');
const ALL_FILE = path.join(ROOT_DIR, 'All.json');
const META_FILE = path.join(ROOT_DIR, 'meta.json');
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
    let metaDb = {};
    const topicMap = new Map();
    const subtopicMap = new Map();
    const diffMap = new Map();
    const allMap = new Map();

    if (fs.existsSync(METADATA_FILE)) {
        try {
            const mData = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
            if (Array.isArray(mData.topics)) {
                mData.topics.forEach(t => topicMap.set(t.code, t));
            }
            if (Array.isArray(mData.subtopics)) {
                mData.subtopics.forEach(st => subtopicMap.set(st.code, st));
            }
            if (Array.isArray(mData.difficulties)) {
                mData.difficulties.forEach(d => diffMap.set(d.code, d));
            }
            if (mData.questions) {
                Object.entries(mData.questions).forEach(([k, q]) => {
                    allMap.set(k, {
                        qcode: q.qcode,
                        difficulty_code: q.difficulty,
                        hkeaa_correct_pc: q.correctRate,
                        topic_code: q.topic ? [q.topic] : [],
                        subtopic_code: q.subtopic ? [q.subtopic] : [],
                        suggested_time: q.suggestedTime,
                        eaa_difficulty_code: q.eaaDifficulty
                    });
                });
            }
            if (!silent) console.log(`[generate-data] Loaded clean metadata from data/metadata.json (${allMap.size} questions, ${topicMap.size} topics)`);
        } catch (e) {
            console.warn('[generate-data] Could not parse data/metadata.json:', e.message);
        }
    } else {
        if (fs.existsSync(META_FILE)) {
            try {
                metaDb = JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
                const cit = Array.isArray(metaDb.subjects) ? metaDb.subjects.find(s => s.code === 'cit') : null;
                if (cit) {
                    if (Array.isArray(cit.topics)) cit.topics.forEach(t => topicMap.set(t.code, t));
                    if (Array.isArray(cit.subtopics)) cit.subtopics.forEach(st => subtopicMap.set(st.code, st));
                }
                if (Array.isArray(metaDb.difficulties)) {
                    metaDb.difficulties.forEach(d => diffMap.set(d.code, d));
                }
            } catch (e) {
                console.warn('[generate-data] Could not parse meta.json:', e.message);
            }
        }
        if (fs.existsSync(ALL_FILE)) {
            try {
                const allDb = JSON.parse(fs.readFileSync(ALL_FILE, 'utf-8'));
                const list = Array.isArray(allDb.result) ? allDb.result : (Array.isArray(allDb) ? allDb : []);
                list.forEach(q => {
                    if (q.year && q.question_no) {
                        allMap.set(`${q.year}_${q.question_no}`, q);
                    }
                });
                if (!silent) console.log('[generate-data] Loaded question bank metadata for', allMap.size, 'questions from All.json');
            } catch (e) {
                console.warn('[generate-data] Could not parse All.json:', e.message);
            }
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

            // Look up metadata from All.json & meta.json
            const allInfo = allMap.get(`${year}_${qNum}`) || null;

            // Look up answer and explanation
            const yearAnswers = answersDb[year] || {};
            const qAnsInfo = yearAnswers[String(qNum)] || null;

            let correctAnswer = qAnsInfo ? qAnsInfo.answer : -1;
            if (correctAnswer === -1 && allInfo && allInfo.suggested_answer) {
                try {
                    const parsedAns = JSON.parse(allInfo.suggested_answer);
                    if (Array.isArray(parsedAns) && typeof parsedAns[0] === 'number') {
                        correctAnswer = parsedAns[0];
                    }
                } catch (e) {}
            }
            const explanation = qAnsInfo && qAnsInfo.explanation ? qAnsInfo.explanation : '';

            // Topic resolution
            const topicCode = Array.isArray(allInfo?.topic_code) && allInfo.topic_code[0] ? allInfo.topic_code[0] : 'cit_1';
            const topicObj = topicMap.get(topicCode) || { code: topicCode, desc_zh: '資訊處理', desc_en: 'Information Processing' };
            const topic = {
                code: topicObj.code,
                nameZh: topicObj.desc_zh,
                nameEn: topicObj.desc_en
            };

            // Subtopic resolution
            let subtopic = null;
            if (Array.isArray(allInfo?.subtopic_code) && allInfo.subtopic_code[0]) {
                const stCode = allInfo.subtopic_code[0];
                const stObj = subtopicMap.get(stCode);
                if (stObj) {
                    subtopic = {
                        code: stObj.code,
                        nameZh: stObj.desc_zh,
                        nameEn: stObj.desc_en
                    };
                }
            }

            // Difficulty resolution
            const diffCode = typeof allInfo?.difficulty_code === 'number' ? allInfo.difficulty_code : 2;
            const diffObj = diffMap.get(diffCode) || { code: diffCode, desc_zh: '普通', desc_en: 'Normal' };
            const difficulty = {
                code: diffCode,
                label: diffObj.desc_zh,
                labelEn: diffObj.desc_en
            };

            const eaaDifficulty = allInfo?.eaa_difficulty_code || '';
            const correctRate = typeof allInfo?.hkeaa_correct_pc === 'number' ? allInfo.hkeaa_correct_pc : null;

            const isDse = Number(year) >= 2012;
            const level = {
                category: isDse ? 'HKDSE' : 'HKCEE',
                stage: isDse ? '高中 (S4-S6)' : '會考 (S4-S5)',
                ksLevel: 'KS4',
                isDse: Boolean(isDse)
            };

            const suggestedTime = allInfo?.suggested_time || 72;
            const qcode = allInfo?.qcode || `HKEAA_cit_${year}_${qNum}`;

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
                qcode,
                level.category,
                level.stage,
                topic.nameZh,
                topic.nameEn,
                subtopic ? subtopic.nameZh : '',
                subtopic ? subtopic.nameEn : '',
                difficulty.label,
                difficulty.labelEn,
                `難度:${difficulty.label}`,
                correctRate !== null ? `答對率:${correctRate}%` : '',
                correctRate !== null ? `${correctRate}%` : '',
                ocrQuestionText,
                ocrOptionsText,
                explanation
            ].filter(Boolean).join(' ').toLowerCase();

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
                qcode,
                difficulty,
                eaaDifficulty,
                correctRate,
                level,
                topic,
                subtopic,
                suggestedTime,
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
    // Aggregate metadata statistics
    const topicStats = {};
    const subtopicStats = {};
    const diffStats = { 1: 0, 2: 0, 3: 0 };
    const correctRateStats = { high: 0, medium: 0, challenging: 0, extreme: 0 };

    for (const yr of yearDirs) {
        const p = papers[yr];
        if (!p || !Array.isArray(p.questions)) continue;
        for (const q of p.questions) {
            if (q.topic?.code) {
                topicStats[q.topic.code] = (topicStats[q.topic.code] || 0) + 1;
            }
            if (q.subtopic?.code) {
                subtopicStats[q.subtopic.code] = (subtopicStats[q.subtopic.code] || 0) + 1;
            }
            if (q.difficulty?.code) {
                diffStats[q.difficulty.code] = (diffStats[q.difficulty.code] || 0) + 1;
            }
            if (typeof q.correctRate === 'number') {
                if (q.correctRate >= 70) correctRateStats.high++;
                else if (q.correctRate >= 50) correctRateStats.medium++;
                else correctRateStats.challenging++;

                if (q.correctRate < 30) correctRateStats.extreme++;
            }
        }
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        totalYears: yearDirs.length,
        totalQuestions: totalQuestionsAll,
        years: yearDirs,
        meta: {
            topics: [
                { code: 'cit_1', nameZh: '資訊處理', nameEn: 'Information Processing', count: topicStats['cit_1'] || 0 },
                { code: 'cit_2', nameZh: '電腦系統基礎', nameEn: 'Computer System Fundamentals', count: topicStats['cit_2'] || 0 },
                { code: 'cit_3', nameZh: '互聯網及其應用', nameEn: 'Internet and its Applications', count: topicStats['cit_3'] || 0 },
                { code: 'cit_4', nameZh: '計算思維與程式編寫', nameEn: 'Computational Thinking and Programming', count: topicStats['cit_4'] || 0 },
                { code: 'cit_5', nameZh: '資訊及通訊科技對社會的影響', nameEn: 'Social Implications', count: topicStats['cit_5'] || 0 }
            ],
            subtopics: Array.from(subtopicMap.values()).map(st => ({
                code: st.code,
                topicCode: st.topic_code,
                nameZh: st.desc_zh,
                nameEn: st.desc_en,
                count: subtopicStats[st.code] || 0
            })),
            difficulties: [
                { code: 1, label: '容易', labelEn: 'Easy', count: diffStats[1] || 0 },
                { code: 2, label: '普通', labelEn: 'Normal', count: diffStats[2] || 0 },
                { code: 3, label: '困難', labelEn: 'Hard', count: diffStats[3] || 0 }
            ],
            correctRateRanges: [
                { id: 'all', label: '全部答對率', min: 0, max: 100, count: totalQuestionsAll },
                { id: 'high', label: '高答對率 (≥70%)', min: 70, max: 100, count: correctRateStats.high, desc: '基礎穩固題' },
                { id: 'medium', label: '中等答對率 (50-69%)', min: 50, max: 69, count: correctRateStats.medium, desc: '標準核心題' },
                { id: 'challenging', label: '挑戰題 (<50%)', min: 0, max: 49, count: correctRateStats.challenging, desc: '鑑別攻堅題' },
                { id: 'extreme', label: '極難題 (<30%)', min: 0, max: 29, count: correctRateStats.extreme, desc: '奪星陷阱題' }
            ]
        },
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
