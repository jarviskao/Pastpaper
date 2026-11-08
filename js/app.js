/**
 * js/app.js
 * Application orchestration, lifecycle, event delegation, keyboard shortcuts,
 * safe import/export, and Service Worker registration.
 */

(function (global) {
    'use strict';

    const App = {
        initialized: false,
        debounceTimer: null,

        async init() {
            if (this.initialized) return;

            try {
                await Store.loadPapersData();
                UI.init();
                // Parse URL shortcuts (PWA launch parameters)
                if (typeof window !== 'undefined' && window.location.search) {
                    const params = new URLSearchParams(window.location.search);
                    const qMode = params.get('mode');
                    const qTab = params.get('tab');
                    if (qMode && ['practice', 'exam', 'study'].includes(qMode)) {
                        Store.mode = qMode;
                    }
                    if (qTab && ['all', 'wrong', 'starred'].includes(qTab)) {
                        Store.currentTab = qTab;
                    }
                }

                // Synchronize mode dropdown
                const modeSelect = document.getElementById('mode');
                if (modeSelect) modeSelect.value = Store.mode;

                // Check and resume interrupted exam session if user agrees
                this.checkExamSession();

                // Render view and start precision timer
                UI.renderAllQuestions();
                Quiz.startTimer();

                // Wire event listeners
                this.bindEvents();

                // Register Service Worker for PWA & offline cache
                this.registerServiceWorker();

                this.initialized = true;

            } catch (err) {
                console.error('[App] Init failed:', err);
                const container = document.getElementById('result');
                if (container) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-center px-4">
                            <h3 class="text-base font-bold text-[#0a0a0a] mb-2">題庫載入失敗</h3>
                            <p class="text-sm text-[#525252] max-w-md">
                                無法讀取題庫資料 (data/papers.json)。請確認您已執行 <code>node scripts/generate-data.js</code> 生成題目，並確認網路或伺服器連線正常。
                            </p>
                            <button onclick="location.reload()" class="mt-5 px-5 py-2.5 bg-[#141414] hover:bg-[#262626] text-white rounded-md text-xs font-bold transition-colors">
                                重新載入
                            </button>
                        </div>
                    `;
                }
            }
        },

        bindEvents() {
            // Year Selector
            const yearSelect = document.getElementById('examyear');
            if (yearSelect) {
                yearSelect.addEventListener('change', (e) => this.handleYearChange(e.target.value, e.target));
            }

            // Mode Selector
            const modeSelect = document.getElementById('mode');
            if (modeSelect) {
                modeSelect.addEventListener('change', (e) => this.handleModeChange(e.target.value, e.target));
            }

            // Search Input with Debounce
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    clearTimeout(this.debounceTimer);
                    this.debounceTimer = setTimeout(() => {
                        Store.searchKeyword = e.target.value;
                        UI.renderAllQuestions();
                    }, 120);
                });
            }

            // Global Keyboard Shortcuts
            window.addEventListener('keydown', (e) => this.handleKeydown(e));
        },

        /**
         * Restart quiz from beginning (e.g. from result modal).
         */
        restartQuiz() {
            UI.toggleModal('result-modal', false);
            Store.resetQuizState();
            Quiz.startTimer();
            UI.renderAllQuestions();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        /**
         * Handle exam paper year change with unsaved exam progress safeguard.
         */
        handleYearChange(newYear, selectEl) {
            // Safeguard active exam
            if (Store.mode === 'exam' && !Store.examSubmitted && Object.keys(Store.userAnswers).length > 0) {
                const proceed = window.confirm('目前考試正在進行中，切換試卷將清除目前的作答進度。確定要切換嗎？');
                if (!proceed) {
                    if (selectEl) selectEl.value = Store.currentYear;
                    return;
                }
            }

            if (newYear === 'custom' && !Store.isCustomMode) {
                UI.toggleModal('custom-exam-modal', true);
                if (selectEl) selectEl.value = Store.currentYear;
                return;
            }

            Store.isCustomMode = (newYear === 'custom');
            Store.currentYear = newYear;
            if (newYear !== 'custom') {
                Store.StorageUtil.setItem(Store.STORAGE_KEYS.YEAR, newYear);
            }
            Store.resetQuizState();
            Quiz.startTimer();
            UI.renderAllQuestions();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        /**
         * Handle mode switch with active exam safeguard.
         */
        handleModeChange(newMode, selectEl) {
            if (Store.mode === 'exam' && !Store.examSubmitted && Object.keys(Store.userAnswers).length > 0 && newMode !== 'exam') {
                const proceed = window.confirm('目前考試正在進行中，切換模式將清除目前的作答進度。確定要切換嗎？');
                if (!proceed) {
                    if (selectEl) selectEl.value = Store.mode;
                    return;
                }
            }

            Store.mode = newMode;
            Store.StorageUtil.setItem(Store.STORAGE_KEYS.MODE, newMode);
            Store.resetQuizState();
            Quiz.startTimer();
            UI.renderAllQuestions();
        },

        /**
         * Check and optionally restore saved in-progress exam session.
         */
        checkExamSession() {
            const session = Store.loadExamSession();
            if (session && session.answers && Object.keys(session.answers).length > 0) {
                const paperLabel = session.isCustomMode ? '自訂試卷' : `${session.year} 年試卷`;
                const resume = window.confirm(`發現上次尚未交卷的考試紀錄 (${paperLabel})，是否繼續？`);
                if (resume) {
                    Store.mode = 'exam';
                    const modeSelect = document.getElementById('mode');
                    if (modeSelect) modeSelect.value = 'exam';

                    Store.currentYear = session.year;
                    Store.isCustomMode = Boolean(session.isCustomMode);
                    if (session.customQuestionSet) {
                        Store.customQuestionSet = session.customQuestionSet;
                    }

                    Store.userAnswers = session.answers || {};
                    Store.seconds = session.seconds || 0;
                    Store.score = session.score || 0;
                    Store.examSubmitted = false;

                    UI.populateYearSelect();
                } else {
                    Store.clearExamSession();
                }
            }
        },

        handleKeydown(e) {
            // Ignore keydown events inside text input fields
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

            // Escape key closes modals, drawers, and active in-place zoom
            if (e.key === 'Escape') {
                if (typeof UI !== 'undefined' && UI.dismissInPlaceZoom) {
                    UI.dismissInPlaceZoom();
                }
                UI.toggleModal('result-modal', false);
                UI.toggleModal('history-modal', false);
                UI.toggleModal('custom-exam-modal', false);
                UI.toggleMobileNav(false);
                return;
            }

            const cards = Array.from(document.querySelectorAll('.question-card'));
            if (cards.length === 0) return;

            const threshold = 110;

            // Quick Question Navigation: 'j' next card, 'k' prev card
            if (e.key === 'j' || e.key === 'k') {
                let nextIdx = 0;
                if (e.key === 'j') {
                    const found = cards.findIndex(c => c.getBoundingClientRect().top > threshold);
                    nextIdx = found !== -1 ? found : cards.length - 1;
                } else {
                    for (let i = cards.length - 1; i >= 0; i--) {
                        if (cards[i].getBoundingClientRect().top < threshold - 20) {
                            nextIdx = i;
                            break;
                        }
                    }
                }
                cards[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }

            // Identify active card near top of viewport for direct keyboard answering (1-4 / a-d) or starring (s)
            const activeCard = cards.find(c => c.getBoundingClientRect().bottom > threshold + 40) || cards[0];
            if (!activeCard || !activeCard.id.startsWith('card_')) return;
            const activeUid = activeCard.id.slice(5);

            const keyLower = e.key.toLowerCase();
            const optMap = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
            if (Object.prototype.hasOwnProperty.call(optMap, keyLower) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                Quiz.handleOptionClick(activeUid, optMap[keyLower]);
            } else if (keyLower === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                UI.toggleStar(activeUid);
            }
        },

        /**
         * Submit custom exam generator form.
         */
        submitCustomExamForm() {
            const checkboxes = document.querySelectorAll('input[name="custom-year"]:checked');
            const selectedYears = Array.from(checkboxes).map(cb => cb.value);

            if (selectedYears.length === 0) {
                UI.showToast('請至少勾選一個年份！', 'warning');
                return;
            }

            const countRange = document.getElementById('custom-count-range');
            const count = countRange ? parseInt(countRange.value, 10) : 40;
            const shuffleQ = document.getElementById('custom-shuffle-q')?.checked ?? true;
            const shuffleO = document.getElementById('custom-shuffle-o')?.checked ?? false;
            const topicCbs = document.querySelectorAll('input[name="custom-topic"]:checked');
            const selectedTopics = Array.from(topicCbs).map(cb => cb.value);
            if (selectedTopics.length === 0) {
                UI.showToast('請至少勾選一個課題！', 'warning');
                return;
            }

            const diffCbs = document.querySelectorAll('input[name="custom-difficulty"]:checked');
            const selectedDiffs = Array.from(diffCbs).map(cb => cb.value);
            if (selectedDiffs.length === 0) {
                UI.showToast('請至少勾選一個難度！', 'warning');
                return;
            }

            const topicFilter = selectedTopics.length === 5 ? 'all' : selectedTopics;
            const difficultyFilter = selectedDiffs.length === 3 ? 'all' : selectedDiffs;
            const correctRateFilter = document.getElementById('custom-correct-rate')?.value || 'all';

            const success = Quiz.generateCustomExam({
                selectedYears,
                count,
                shuffleQ,
                shuffleO,
                topicFilter,
                difficultyFilter,
                correctRateFilter
            });

            if (success) {
                UI.toggleModal('custom-exam-modal', false);
                UI.populateYearSelect();
                UI.renderAllQuestions();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                UI.showToast(`自訂試卷生成完畢，共 ${Store.getCurrentPaperQuestions().length} 題！`, 'success');
            }
        },

        /**
         * Backup user progress, starred questions, and exam history.
         */
        exportUserData() {
            const payload = {
                app: 'ict-mc-platform',
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                starred: Array.from(Store.starredIds),
                history: Store.getHistory()
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ict_mc_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            UI.showToast('進度資料已成功匯出備份！', 'success');
        },

        /**
         * Restore user data from JSON backup with rigorous structural validation.
         */
        importUserData(inputEl) {
            const file = inputEl?.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    // Validate starred
                    if (data.starred && Array.isArray(data.starred)) {
                        const validStarred = data.starred.filter(id => typeof id === 'string' && id.trim().length > 0);
                        Store.starredIds = new Set(validStarred);
                        Store.StorageUtil.setJSON(Store.STORAGE_KEYS.STARRED, validStarred);
                    }

                    // Validate history
                    if (data.history && Array.isArray(data.history)) {
                        const validHistory = data.history.filter(item => (
                            item &&
                            typeof item.score === 'number' &&
                            typeof item.total === 'number' &&
                            typeof item.year === 'string'
                        ));
                        Store.StorageUtil.setJSON(Store.STORAGE_KEYS.HISTORY, validHistory);
                    }
                    UI.showToast('進度資料匯入成功！', 'success');
                    UI.renderHistoryList();
                    UI.renderAllQuestions();

                } catch (err) {
                    console.error('[App] Import failed:', err);
                    UI.showToast('匯入失敗：備份檔案損毀或格式不符合！', 'error');
                }
            };
            reader.readAsText(file);
            inputEl.value = '';
        },

        /**
         * Register modern Service Worker for offline capabilities.
         */
        registerServiceWorker() {
            if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('sw.js')
                        .then((reg) => {
                            // Listen for service worker updates
                            reg.addEventListener('updatefound', () => {
                                const newWorker = reg.installing;
                                if (!newWorker) return;
                                newWorker.addEventListener('statechange', () => {
                                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                        UI.showToast('題庫應用有新版本可用，重新整理即可套用！', 'info');
                                    }
                                });
                            });
                        })
                        .catch(err => {
                            console.warn('[SW] ServiceWorker registration skipped/failed:', err);
                        });
                });
            }
        }
    };

    global.App = App;

    // Bootstrap on DOM ready
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => App.init());
        } else {
            App.init();
        }
    }
})(typeof window !== 'undefined' ? window : this);
