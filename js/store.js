/**
 * js/store.js
 * Centralized State Management, Queries, and Persistence for ICT Past Paper Platform.
 * Designed for Clean Code, high defensive reliability, and long-term maintainability.
 */

(function (global) {
    'use strict';

    const STORAGE_KEYS = Object.freeze({
        YEAR: 'ict_year',
        MODE: 'ict_mode',
        STARRED: 'ict_starred',
        HISTORY: 'ict_history',
        EXAM_SESSION: 'ict_exam_session',
        FONT_SCALE: 'ict_font_scale',
        APP_SETTINGS: 'ict_app_settings'
    });

    /**
     * Storage helper with robust error handling for private browsing / quota limits.
     */
    const StorageUtil = {
        getItem(key, fallback = null) {
            try {
                const val = localStorage.getItem(key);
                return val !== null ? val : fallback;
            } catch (err) {
                console.warn(`[Store] LocalStorage read failed for "${key}":`, err);
                return fallback;
            }
        },

        getJSON(key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return fallback;
                return JSON.parse(raw);
            } catch (err) {
                console.warn(`[Store] LocalStorage JSON parse failed for "${key}":`, err);
                return fallback;
            }
        },

        setItem(key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (err) {
                console.warn(`[Store] LocalStorage write failed for "${key}":`, err);
                return false;
            }
        },

        setJSON(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (err) {
                console.warn(`[Store] LocalStorage JSON save failed for "${key}":`, err);
                return false;
            }
        },

        removeItem(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (err) {
                console.warn(`[Store] LocalStorage remove failed for "${key}":`, err);
                return false;
            }
        }
    };

    const Store = {
        STORAGE_KEYS,
        StorageUtil,
        // Loaded Dataset
        data: null,              // { generatedAt, totalYears, totalQuestions, years, papers }
        years: [],               // ['2025', '2024', ...]

        // Active State
        currentYear: '',         // e.g. '2025' or 'custom'
        searchScope: 'current',  // 'current' | 'all'
        allQuestionsCache: null,
        mode: 'practice',        // 'practice' | 'exam' | 'study'
        currentTab: 'all',       // 'all' | 'wrong' | 'starred'
        searchKeyword: '',
        filterTopic: 'all',          // 'all' | 'cit_1' | 'cit_2' | 'cit_3' | 'cit_4' | 'cit_5'
        filterDifficulty: 'all',     // 'all' | '1' | '2' | '3'
        filterCorrectRate: 'all',    // 'all' | 'high' | 'medium' | 'challenging' | 'extreme'
        // Progress & Answers
        userAnswers: {},         // { [uid]: { visualIndex, selectedPart, isCorrect, answeredAt } }
        score: 0,
        examSubmitted: false,
        seconds: 0,
        timerStartTime: null,
        timerAccumulatedSeconds: 0,

        // Starred & Custom Sets
        starredIds: new Set(),
        customQuestionSet: [],
        isCustomMode: false,

        /**
         * Fetch papers dataset from data/papers.json and hydrate initial state.
         * @returns {Promise<Object>} Loaded paper dataset
         */
        async loadPapersData() {
            try {
                const resp = await fetch('data/papers.json');
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}: 無法讀取 data/papers.json`);
                }
                const dataset = await resp.json();
                this.setData(dataset);
                return this.data;
            } catch (err) {
                console.error('[Store] Failed to load data/papers.json:', err);
                throw err;
            }
        },

        /**
         * Initialize store state with loaded dataset.
         * @param {Object} dataset - Parsed data/papers.json payload
         */
        setData(dataset) {
            this.data = dataset || { years: [], papers: {} };
            this.years = Array.isArray(dataset?.years) ? [...dataset.years] : [];
            this.allQuestionsCache = null;

            // Restore last selected year or default to newest (never default to 'custom' without customQuestionSet)
            const savedYear = StorageUtil.getItem(this.STORAGE_KEYS.YEAR);
            if (savedYear && this.years.includes(savedYear)) {
                this.currentYear = savedYear;
            } else {
                this.currentYear = this.years[0] || '';
            }

            // Restore saved mode
            const savedMode = StorageUtil.getItem(this.STORAGE_KEYS.MODE);
            if (savedMode && ['practice', 'exam', 'study'].includes(savedMode)) {
                this.mode = savedMode;
            }

            // Restore Starred
            this.loadStarred();
        },

        /**
         * Get questions for the currently selected paper or custom test.
         * @returns {Array} Array of question objects
         */
        getCurrentPaperQuestions() {
            if (!this.data) return [];
            if (this.isCustomMode && this.currentYear === 'custom') {
                return this.customQuestionSet || [];
            }
            const paper = this.data.papers?.[this.currentYear];
            return paper && Array.isArray(paper.questions) ? paper.questions : [];
        },

        /**
         * Get flattened list of all questions across all years (cached).
         * @returns {Array} Array of all questions
         */
        getAllQuestions() {
            if (this.allQuestionsCache) return this.allQuestionsCache;
            if (!this.data || !this.data.papers) return [];

            const list = [];
            for (const yr of this.years) {
                const p = this.data.papers[yr];
                if (p && Array.isArray(p.questions)) {
                    list.push(...p.questions);
                }
            }
            this.allQuestionsCache = list;
            return list;
        },

        /**
         * Invalidate flattened cache.
         */
        invalidateCache() {
            this.allQuestionsCache = null;
        },

        /**
         * Get questions filtered by active tab and search criteria.
         * @returns {Array} Filtered questions
         */
        getDisplayQuestions() {
            const rawKw = (this.searchKeyword || '').trim();
            const isSearching = rawKw.length > 0;

            const baseList = (this.searchScope === 'all')
                ? this.getAllQuestions()
                : this.getCurrentPaperQuestions();

            let list = baseList;

            // 1. Tab filtering
            if (this.currentTab === 'starred') {
                list = list.filter(q => this.starredIds.has(q.uid));
            } else if (this.currentTab === 'wrong') {
                if (this.mode === 'exam' && !this.examSubmitted) {
                    return []; // Don't reveal wrong questions while exam is active
                }
                list = list.filter(q => {
                    const ans = this.userAnswers[q.uid];
                    return ans && ans.isCorrect === false;
                });
            }
            // 2. Flexible Metadata Filters (Topic, Difficulty, Correct Rate)
            if (this.filterTopic && this.filterTopic !== 'all') {
                list = list.filter(q => q.topic && q.topic.code === this.filterTopic);
            }

            if (this.filterDifficulty && this.filterDifficulty !== 'all') {
                const diffCode = parseInt(this.filterDifficulty, 10);
                list = list.filter(q => q.difficulty && q.difficulty.code === diffCode);
            }

            if (this.filterCorrectRate && this.filterCorrectRate !== 'all') {
                list = list.filter(q => {
                    if (typeof q.correctRate !== 'number') return false;
                    switch (this.filterCorrectRate) {
                        case 'high':
                            return q.correctRate >= 70;
                        case 'medium':
                            return q.correctRate >= 50 && q.correctRate < 70;
                        case 'challenging':
                            return q.correctRate < 50;
                        case 'extreme':
                            return q.correctRate < 30;
                        default:
                            return true;
                    }
                });
            }


            // 2. Search query filtering
            if (isSearching) {
                list = this.filterBySearch(list, rawKw);
            }

            return list;
        },

        /**
         * Smart search filtering supporting question numbers, compound queries, and OCR text.
         * @param {Array} questions - Candidate questions
         * @param {string} rawKw - Raw search keyword
         * @returns {Array} Filtered list
         */
        filterBySearch(questions, rawKw) {
            const kw = rawKw.toLowerCase();

            // Case A: Pure question number intent (e.g. "5", "12", "q5", "第12題")
            const qNumMatch = kw.match(/^(?:q|第)?\s*(\d{1,2})\s*(?:題)?$/i);
            if (qNumMatch) {
                const targetQNum = parseInt(qNumMatch[1], 10);
                if (targetQNum >= 1 && targetQNum <= 60) {
                    return questions.filter(q => q.qNum === targetQNum);
                }
            }

            // Case B: Compound or multi-token search
            const tokens = kw.split(/\s+/).filter(Boolean);
            if (tokens.length === 0) return questions;

            // Check if one token is a 4-digit exam year (e.g. "2024 15")
            let yearFilter = null;
            let qNumFilter = null;
            const remainingTokens = [];

            for (const token of tokens) {
                if (/^\d{4}$/.test(token) && this.years.includes(token)) {
                    yearFilter = token;
                } else if (/^(?:q|第)?\s*(\d{1,2})\s*(?:題)?$/i.test(token)) {
                    const m = token.match(/^(?:q|第)?\s*(\d{1,2})\s*(?:題)?$/i);
                    qNumFilter = parseInt(m[1], 10);
                } else {
                    remainingTokens.push(token);
                }
            }

            return questions.filter(q => {
                if (yearFilter && q.year !== yearFilter) return false;
                if (qNumFilter !== null && q.qNum !== qNumFilter) return false;

                if (remainingTokens.length === 0) return true;

                const searchStr = q.searchText || `${q.year} q${q.qNum} ${q.explanation || ''}`.toLowerCase();
                return remainingTokens.every(tok => searchStr.includes(tok));
            });
        },

        // --- Starred Management ---

        loadStarred() {
            const parsed = StorageUtil.getJSON(this.STORAGE_KEYS.STARRED, []);
            this.starredIds = new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []);
        },

        toggleStar(uid) {
            if (!uid) return false;
            const isCurrentlyStarred = this.starredIds.has(uid);
            if (isCurrentlyStarred) {
                this.starredIds.delete(uid);
            } else {
                this.starredIds.add(uid);
            }
            StorageUtil.setJSON(this.STORAGE_KEYS.STARRED, Array.from(this.starredIds));
            return !isCurrentlyStarred;
        },

        isStarred(uid) {
            return this.starredIds.has(uid);
        },

        // --- History Records ---

        getHistory() {
            const raw = StorageUtil.getJSON(this.STORAGE_KEYS.HISTORY, []);
            return Array.isArray(raw) ? raw : [];
        },

        saveHistoryItem(record) {
            if (!record) return;
            const list = this.getHistory();
            list.unshift(record);
            if (list.length > 50) list.length = 50; // Cap at 50 records
            StorageUtil.setJSON(this.STORAGE_KEYS.HISTORY, list);
        },

        clearHistory() {
            StorageUtil.removeItem(this.STORAGE_KEYS.HISTORY);
        },

        // --- Exam Session Persistence ---

        saveExamSession() {
            if (this.mode !== 'exam' || this.examSubmitted) return;
            const session = {
                year: this.currentYear,
                isCustomMode: this.isCustomMode,
                customQuestionSet: this.isCustomMode ? this.customQuestionSet : null,
                answers: this.userAnswers,
                score: this.score,
                seconds: this.seconds,
                timestamp: Date.now()
            };
            StorageUtil.setJSON(this.STORAGE_KEYS.EXAM_SESSION, session);
        },

        loadExamSession() {
            const session = StorageUtil.getJSON(this.STORAGE_KEYS.EXAM_SESSION, null);
            if (!session) return null;

            // Session expires after 24 hours
            if (Date.now() - session.timestamp > 86400000) {
                this.clearExamSession();
                return null;
            }
            return session;
        },

        clearExamSession() {
            StorageUtil.removeItem(this.STORAGE_KEYS.EXAM_SESSION);
        },

        // --- Reset Helpers ---

        resetQuizState() {
            this.userAnswers = {};
            this.score = 0;
            this.examSubmitted = false;
            this.seconds = 0;
            this.timerStartTime = null;
            this.timerAccumulatedSeconds = 0;
            this.clearExamSession();
        },

        /**
         * Reset answers for incorrectly answered questions, allowing targeted re-testing.
         * @returns {number} Count of reset questions
         */
        resetWrongQuestions() {
            const questions = this.getCurrentPaperQuestions();
            let count = 0;
            questions.forEach(q => {
                const ans = this.userAnswers[q.uid];
                if (ans && ans.isCorrect === false) {
                    delete this.userAnswers[q.uid];
                    count++;
                }
            });
            return count;
        },

        /**
         * Recalculate total correct score from current paper's userAnswers.
         * @returns {number} Updated score
         */
        recalculateScore() {
            const questions = this.getCurrentPaperQuestions();
            let correct = 0;
            for (const q of questions) {
                const ans = this.userAnswers[q.uid];
                if (ans && ans.isCorrect === true) {
                    correct++;
                }
            }
            this.score = correct;
            return correct;
        },

        // --- Flexible Filtering Helpers ---

        setFilterTopic(topicCode) {
            this.filterTopic = topicCode || 'all';
        },

        setFilterDifficulty(diffCode) {
            this.filterDifficulty = diffCode || 'all';
        },

        setFilterCorrectRate(rateRangeId) {
            this.filterCorrectRate = rateRangeId || 'all';
        },

        resetFilters() {
            this.filterTopic = 'all';
            this.filterDifficulty = 'all';
            this.filterCorrectRate = 'all';
            this.searchKeyword = '';
        },

        hasActiveFilters() {
            return (this.filterTopic !== 'all') ||
                   (this.filterDifficulty !== 'all') ||
                   (this.filterCorrectRate !== 'all') ||
                   (Boolean((this.searchKeyword || '').trim()));
        }
    };

    global.Store = Store;
})(typeof window !== 'undefined' ? window : this);
