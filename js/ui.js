/**
 * js/ui.js
 * UI rendering, responsive layout, DOM manipulation, accessible modals, and lightbox.
 * Engineered for Clean Code, strict XSS defense, accessibility, and high performance.
 * Follows the Achromatic Ledger design system (seed 1021686034).
 */

(function (global) {
    'use strict';

    /**
     * Strict HTML escaping utility to prevent XSS and DOM parsing breakage
     * on math/algorithm inequality symbols (<, >) and code fragments.
     * @param {string} str
     * @returns {string} Sanitized HTML string
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const UI = {
        fontScale: 1.0,
        toastTimer: null,

        init() {
            this.populateYearSelect();
            this.initFontScale();
        },

        escapeHtml,

        /**
         * Lightweight non-blocking toast notifications.
         * @param {string} message
         * @param {'info'|'success'|'warning'|'error'} [type='info']
         */
        showToast(message, type = 'info') {
            let toast = document.getElementById('app-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'app-toast';
                document.body.appendChild(toast);
            }

            const styles = {
                info: 'bg-[#141414] text-white border-[#262626] shadow-lg',
                success: 'bg-[#dcfae5] text-[#04250e] border-[#247b50] shadow-md',
                warning: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a] shadow-md',
                error: 'bg-[#ffedea] text-[#831c1e] border-[#c4242a] shadow-md'
            };

            const icons = {
                info: 'fas fa-info-circle text-white',
                success: 'fas fa-check-circle text-[#247b50]',
                warning: 'fas fa-exclamation-triangle text-[#92400e]',
                error: 'fas fa-times-circle text-[#c4242a]'
            };

            toast.className = `fixed top-16 right-4 z-[120] max-w-sm px-4 py-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2.5 ${styles[type] || styles.info}`;
            toast.innerHTML = `<i class="${icons[type] || icons.info}"></i> <span>${escapeHtml(message)}</span>`;

            // Trigger smooth spring enter
            requestAnimationFrame(() => {
                toast.classList.add('toast-visible');
            });

            clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => {
                toast.classList.remove('toast-visible');
            }, 3000);
        },

        /**
         * Populate Year dropdown select options.
         */
        populateYearSelect() {
            const select = document.getElementById('examyear');
            if (!select) return;

            select.innerHTML = '';

            if (Store.isCustomMode) {
                const customOpt = new Option('自訂模擬試卷', 'custom');
                select.add(customOpt);
            }

            Store.years.forEach(year => {
                const paper = Store.data?.papers?.[year];
                const label = paper ? `${paper.label} (${paper.totalQuestions}題)` : `${year} 年`;
                select.add(new Option(label, year));
            });

            select.value = Store.currentYear;

            const scopeLabel = document.getElementById('search-scope-label');
            if (scopeLabel && Store.data?.totalQuestions) {
                scopeLabel.textContent = `全庫搜尋 (${Store.data.totalQuestions}題)`;
            }
        },

        /**
         * Render all questions in main content feed.
         */
        renderAllQuestions() {
            const container = document.getElementById('result');
            if (!container) return;

            const questions = Store.getDisplayQuestions();
            const mode = Store.mode;

            // Update submit button visibility for Exam mode
            const isExamActive = (mode === 'exam' && !Store.examSubmitted);
            const desktopSubmitBtn = document.getElementById('desktop-submit-btn');
            if (desktopSubmitBtn) {
                desktopSubmitBtn.style.display = isExamActive ? 'flex' : 'none';
            }
            const mobileSubmitBtn = document.getElementById('mobile-submit-btn');
            if (mobileSubmitBtn) {
                if (isExamActive) {
                    mobileSubmitBtn.classList.remove('hidden');
                    mobileSubmitBtn.classList.add('flex');
                } else {
                    mobileSubmitBtn.classList.add('hidden');
                    mobileSubmitBtn.classList.remove('flex');
                }
            }

            container.innerHTML = '';

            // Handle empty states
            if (questions.length === 0) {
                let emptyMsg = '找不到符合條件的題目';
                let iconClass = 'far fa-folder-open';

                if (Store.currentTab === 'wrong') {
                    if (mode === 'exam' && !Store.examSubmitted) {
                        emptyMsg = '考試進行中，請於交卷後查看錯題';
                        iconClass = 'fas fa-lock text-[#525252]';
                    } else {
                        emptyMsg = '目前沒有答錯的題目';
                        iconClass = 'fas fa-check-circle text-[#247b50]';
                    }
                } else if (Store.currentTab === 'starred') {
                    emptyMsg = '尚未收藏任何題目，點擊題目右上角的星號即可加入收藏';
                    iconClass = 'far fa-star text-[#92400e]';
                }

                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-16 text-[#525252] text-center px-4 bg-white rounded-lg border border-[#e6e6e6]">
                        <i class="${iconClass} text-4xl mb-3 opacity-80"></i>
                        <p class="font-semibold text-sm text-[#0a0a0a] mt-1">${escapeHtml(emptyMsg)}</p>
                    </div>
                `;
                this.updateDashboard();
                this.updateNavigator();
                return;
            }

            // Optional Wrong-Tab Action Bar: Retry wrong questions
            if (Store.currentTab === 'wrong' && questions.length > 0) {
                const retryBanner = document.createElement('div');
                retryBanner.className = 'mb-3.5 p-3 bg-[#ffedea] border border-[#ffc9c2] rounded-md flex items-center justify-between text-xs sm:text-sm';
                retryBanner.innerHTML = `
                    <div class="flex items-center gap-2 text-[#831c1e] font-semibold">
                        <i class="fas fa-redo-alt text-xs"></i>
                        <span>共有 ${questions.length} 道錯題需加強溫習</span>
                    </div>
                    <button onclick="UI.retryWrongQuestions()" class="px-3 py-1.5 bg-[#c4242a] hover:bg-[#a61b20] text-white font-bold rounded-md transition-colors text-xs flex items-center gap-1.5 shadow-xs">
                        <i class="fas fa-edit text-xs"></i>
                        <span>重新作答錯題</span>
                    </button>
                `;
                container.appendChild(retryBanner);
            }

            const fragment = document.createDocumentFragment();

            questions.forEach(q => {
                const card = this.createQuestionCard(q);
                fragment.appendChild(card);
            });

            container.appendChild(fragment);

            // Restore visual selection state for all questions
            questions.forEach(q => {
                this.restoreQuestionState(q);
            });

            this.updateDashboard();
            this.updateNavigator();
        },

        /**
         * Re-attempt all wrong questions in the current paper.
         */
        retryWrongQuestions() {
            // If in exam mode, switch to practice mode so user can answer and receive instant feedback
            if (Store.mode === 'exam') {
                Store.mode = 'practice';
                const modeSelect = document.getElementById('mode');
                if (modeSelect) modeSelect.value = 'practice';
            }
            const count = Store.resetWrongQuestions();
            Quiz.startTimer();
            this.showToast(`已重設 ${count} 道錯題，請重新作答！`, 'info');
            this.renderAllQuestions();
        },

        /**
         * Construct DOM card for a single question with strict HTML escaping.
         * @param {Object} q - Question object
         * @returns {HTMLElement} Question card element
         */
        createQuestionCard(q) {
            const card = document.createElement('div');
            card.className = 'question-card bg-white p-4 sm:p-5 rounded-lg border border-[#e6e6e6] scroll-mt-20 sm:scroll-mt-24 transition-colors';
            card.id = `card_${q.uid}`;

            const isStarred = Store.starredIds.has(q.uid);
            const displayIndex = q.paperIndex !== undefined ? (q.paperIndex + 1) : q.qNum;

            const safeQuestionText = escapeHtml(q.ocrText?.question || '（暫無題目文字）');
            const safeOptionsText = q.ocrText?.options ? escapeHtml(q.ocrText.options) : '';

            const isMatchingSearch = Store.searchKeyword.trim() && q.searchText && q.searchText.includes(Store.searchKeyword.trim().toLowerCase());

            // Build Options HTML
            let optionsHtml = '';
            q.options.forEach((opt, optIdx) => {
                const isEliminated = Store.isOptionEliminated(q.uid, optIdx);
                const optKeyHint = ['1', '2', '3', '4'][optIdx] || '';
                const eliminatedClass = isEliminated ? 'opt-eliminated' : '';

                optionsHtml += `
                    <button id="btn_${q.uid}_${optIdx}" onclick="Quiz.handleOptionClick('${q.uid}', ${optIdx})" oncontextmenu="event.preventDefault(); UI.handleOptionContextMenu('${q.uid}', ${optIdx});" ontouchstart="UI.handleOptionTouchStart(event, '${q.uid}', ${optIdx})" ontouchend="UI.handleOptionTouchEnd(event)" ontouchmove="UI.handleOptionTouchCancel()" ontouchcancel="UI.handleOptionTouchCancel()" class="option-btn opt-default ${eliminatedClass} w-full text-left px-3.5 py-2.5 rounded-md border flex items-center justify-between group">
                        <div class="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                            <div id="badge_${q.uid}_${optIdx}" class="w-6 h-6 sm:w-7 sm:h-7 rounded border border-[#d4d4d4] bg-[#f4f6f8] flex items-center justify-center text-xs font-bold text-[#0a0a0a] num shrink-0 transition-colors">
                                ${escapeHtml(opt.letter)}
                            </div>
                            <img src="${opt.img}" alt="選項 ${opt.letter}" class="max-h-16 sm:max-h-20 object-contain pointer-events-none select-none" loading="lazy" onerror="this.alt='選項圖片載入失敗'">
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <span class="hidden sm:inline-block text-[11px] font-mono text-[#a3a3a3] opacity-60 group-hover:opacity-100 transition-opacity" title="鍵盤快捷鍵">[${optKeyHint}]</span>
                            <i id="icon_${q.uid}_${optIdx}" class="text-base shrink-0"></i>
                        </div>
                    </button>
                `;
            });

            // Build Explanation HTML
            const rawExp = q.explanation ? q.explanation : '此題暫無詳細解釋。';
            const safeExp = escapeHtml(rawExp).replace(/\n/g, '<br>');
            const shuffleNote = q.optionsShuffled
                ? `<div class="mt-2 text-xs text-[#0a0a0a] font-semibold bg-[#eef4fc] p-2 rounded border border-[#c4dcfa]">
                     <i class="fas fa-random text-[#1d5fbf] mr-1"></i> 已啟用選項隨機重組：本題原卷官方答案為 <strong>${escapeHtml(q.answerLetter)}</strong>。
                   </div>`
                : '';

            // Metadata Definitions for Explanation Bar
            const topicName = q.topic?.nameZh || '資訊處理';
            const subtopicName = q.subtopic?.nameZh || '';
            const diffLabel = q.difficulty?.label || '普通';
            const levelCat = q.level?.category || (Number(q.year) >= 2012 ? 'HKDSE' : 'HKCEE');
            const levelStage = q.level?.stage || (Number(q.year) >= 2012 ? '高中 S4-S6' : '會考 S4-S5');

            card.innerHTML = `
                <div class="flex justify-between items-center mb-3 pb-2 border-b border-[#f0f0f0]">
                    <div class="flex items-center gap-2">
                        <span class="bg-[#f4f6f8] border border-[#e6e6e6] text-[#0a0a0a] text-xs font-bold px-2 py-0.5 rounded num">
                            第 ${displayIndex} 題
                        </span>
                        <span class="text-xs text-[#525252] font-semibold num">(${escapeHtml(String(q.year))})</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button onclick="UI.toggleTextPreview('${q.uid}')" class="px-2 py-1 rounded text-xs font-semibold text-[#525252] hover:text-[#0a0a0a] hover:bg-[#eeeeee] transition-colors flex items-center gap-1 border border-[#d4d4d4]" title="檢視 OCR 識別文本">
                            <i class="fas fa-file-alt text-xs"></i>
                            <span class="hidden sm:inline">文字審查</span>
                        </button>
                        <button onclick="UI.toggleStar('${q.uid}')" class="p-1.5 text-[#525252] hover:text-[#92400e] transition-transform active:scale-110" title="收藏題目" aria-label="收藏題目">
                            <i id="star_${q.uid}" class="${isStarred ? 'fas fa-star text-[#92400e]' : 'far fa-star text-[#a3a3a3]'} text-sm"></i>
                        </button>
                    </div>
                </div>

                <!-- OCR Text Preview Box -->
                <div id=\"ocr_box_${q.uid}\" class="${isMatchingSearch ? '' : 'hidden'} mb-3.5 p-3 bg-[#f4f6f8] border border-[#e6e6e6] rounded-md text-sm text-[#0a0a0a] leading-relaxed select-auto">
                    <div class=\"font-bold text-[#525252] text-xs mb-1.5 flex items-center justify-between\">
                        <span class=\"flex items-center gap-1.5\"><i class=\"fas fa-search text-xs\"></i> OCR 識別文本審查</span>
                        <span class=\"text-xs text-[#525252] font-normal\">支援文字複製與檢索</span>
                    </div>
                    <div class=\"ocr-question-text mb-2 text-[#0a0a0a] whitespace-pre-wrap\">${this.highlightKeywords(safeQuestionText, Store.searchKeyword)}</div>
                    ${safeOptionsText ? `<div class=\"ocr-options-text pt-2 border-t border-[#e6e6e6] text-[#525252] text-xs whitespace-pre-wrap\">${this.highlightKeywords(safeOptionsText, Store.searchKeyword)}</div>` : ''}
                </div>

                <!-- Question Image -->
                <div class=\"mb-3.5 flex justify-start overflow-hidden rounded\">
                    <img src=\"${q.questionImg}\" alt=\"題目 ${q.qNum}\" class=\"exam-img max-w-full h-auto cursor-zoom-in rounded\" loading=\"lazy\" onclick=\"UI.toggleInlineZoom(this)\" onerror=\"this.alt='題目圖片載入失敗'\">
                </div>

                <!-- Options -->
                <div class=\"space-y-2 mb-2\" id=\"options_${q.uid}\">
                    ${optionsHtml}
                </div>

                <!-- Explanation Box -->
                <div id=\"exp_${q.uid}\" class=\"hidden mt-3.5 pt-3 border-t border-[#f0f0f0] explanation-box\">
                    <div class=\"p-3.5 bg-[#f4f6f8] rounded-md border border-[#e6e6e6] flex flex-col gap-2.5\">
                        <!-- Metadata Pill Bar -->
                        <!-- Metadata Pill Bar -->
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-2.5 bg-white rounded border border-[#e5e7eb]">
                            <div>
                                <span class="text-[#6b7280] block text-[11px]">考試程度</span>
                                <span class="font-bold text-[#111827]">${escapeHtml(levelCat)} <span class="text-[#6b7280] font-normal text-[11px]">(${escapeHtml(levelStage)})</span></span>
                            </div>
                            <div>
                                <span class="text-[#6b7280] block text-[11px]">課題與子課題</span>
                                <span class="font-bold text-[#111827]">${escapeHtml(topicName)}${subtopicName ? `<span class="text-[#4b5563] font-medium text-[11px] block">${escapeHtml(subtopicName)}</span>` : ''}</span>
                            </div>
                            <div>
                                <span class="text-[#6b7280] block text-[11px]">題目難度</span>
                                <span class="font-bold text-[#111827]">${escapeHtml(diffLabel)} <span class="text-[#6b7280] font-normal text-[11px]">(${escapeHtml(q.difficulty?.labelEn || 'Normal')})</span></span>
                            </div>
                            <div>
                                <span class="text-[#6b7280] block text-[11px]">考評局答對率</span>
                                <span class="font-bold text-[#111827]">${typeof q.correctRate === 'number' ? `${q.correctRate}%` : '暫無統計'}</span>
                            </div>
                        </div>

                        <div class=\"font-bold text-xs text-[#0a0a0a] flex items-center gap-1.5\">
                            <i class=\"fas fa-lightbulb text-xs text-[#1d5fbf]\"></i>
                            <span>詳細題解說明</span>
                        </div>
                        <div class=\"text-sm text-[#0a0a0a] leading-relaxed select-auto\">
                            ${safeExp}
                        </div>
                        ${shuffleNote}
                    </div>
                </div>
            `;
            return card;
        },

        /**
         * Mark an option as selected during Exam mode.
         */
        markQuestionSelected(question, selectedIdx) {
            question.options.forEach((_, i) => {
                const btn = document.getElementById(`btn_${question.uid}_${i}`);
                const badge = document.getElementById(`badge_${question.uid}_${i}`);
                if (!btn || !badge) return;

                const isSel = (i === selectedIdx);
                btn.className = `option-btn w-full text-left px-3.5 py-2.5 rounded-md border flex items-center justify-between group ${isSel ? 'opt-selected font-bold' : 'opt-default'}`;
                badge.className = `w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center text-xs font-bold num shrink-0 ${isSel ? 'bg-[#1d5fbf] text-white border-transparent' : 'border border-[#d4d4d4] bg-[#f4f6f8] text-[#0a0a0a]'}`;
            });
        },

        /**
         * Reveal correct/wrong options on answering or submission.
         */
        revealQuestionAnswer(question, userVisualIdx, isStudyMode) {
            const correctPart = question.answer >= 0 ? question.answer + 1 : -1;
            const correctVisualIdx = question.options.findIndex(opt => opt.part === correctPart);

            question.options.forEach((opt, i) => {
                const btn = document.getElementById(`btn_${question.uid}_${i}`);
                const badge = document.getElementById(`badge_${question.uid}_${i}`);
                const icon = document.getElementById(`icon_${question.uid}_${i}`);
                if (!btn) return;

                btn.disabled = true;

                if (i === correctVisualIdx) {
                    btn.className = 'option-btn opt-correct w-full text-left px-3.5 py-2.5 rounded-md border flex items-center justify-between font-bold';
                    if (badge) badge.className = 'w-6 h-6 sm:w-7 sm:h-7 rounded bg-[#247b50] text-white flex items-center justify-center text-xs font-bold num shrink-0 border-transparent';
                    if (icon) icon.className = 'fas fa-check-circle text-[#247b50] text-base';
                } else if (i === userVisualIdx && i !== correctVisualIdx && !isStudyMode) {
                    btn.className = 'option-btn opt-wrong w-full text-left px-3.5 py-2.5 rounded-md border flex items-center justify-between font-bold';
                    if (badge) badge.className = 'w-6 h-6 sm:w-7 sm:h-7 rounded bg-[#c4242a] text-white flex items-center justify-center text-xs font-bold num shrink-0 border-transparent';
                    if (icon) icon.className = 'fas fa-times-circle text-[#c4242a] text-base';
                } else {
                    btn.className = 'option-btn opt-default opt-dimmed w-full text-left px-3.5 py-2.5 rounded-md border flex items-center justify-between';
                    if (badge) badge.className = 'w-6 h-6 sm:w-7 sm:h-7 rounded border border-[#d4d4d4] bg-[#f4f6f8] text-[#525252] flex items-center justify-center text-xs font-bold num shrink-0';
                    if (icon) icon.className = '';
                }
            });

            const expEl = document.getElementById(`exp_${question.uid}`);
            if (expEl) expEl.classList.remove('hidden');
        },

        /**
         * Restore visual state when cards are re-rendered.
         */
        restoreQuestionState(q) {
            const mode = Store.mode;
            const ans = Store.userAnswers[q.uid];
            const visualIdx = ans !== undefined ? ans.visualIndex : -1;

            if (mode === 'study') {
                this.revealQuestionAnswer(q, -1, true);
            } else if (mode === 'exam') {
                if (Store.examSubmitted) {
                    this.revealQuestionAnswer(q, visualIdx, visualIdx === -1);
                } else if (visualIdx >= 0) {
                    this.markQuestionSelected(q, visualIdx);
                }
            } else if (mode === 'practice' && ans !== undefined) {
                this.revealQuestionAnswer(q, visualIdx, false);
            }
        },

        /**
         * Update dashboard counters, progress bars, and search stats.
         */
        updateDashboard() {
            const questions = Store.getCurrentPaperQuestions();
            const total = questions.length;
            const answeredCount = questions.reduce((acc, q) => acc + (Store.userAnswers[q.uid] !== undefined ? 1 : 0), 0);

            // Top Header
            const headerScore = document.getElementById('header-score');
            const headerTotal = document.getElementById('header-total');
            if (headerScore) headerScore.textContent = Store.score;
            if (headerTotal) headerTotal.textContent = total;

            // Streak combo badge in header
            const streakContainer = document.getElementById('streak-badge-container');
            const streakCountEl = document.getElementById('streak-count');
            if (streakContainer && streakCountEl) {
                if (Store.mode === 'practice' && Store.currentStreak >= 2) {
                    streakContainer.classList.remove('hidden');
                    streakContainer.classList.add('inline-flex');
                    streakCountEl.textContent = Store.currentStreak;
                } else {
                    streakContainer.classList.add('hidden');
                    streakContainer.classList.remove('inline-flex');
                }
            }

            // Sidebar stats
            const sideScore = document.getElementById('sidebar-score');
            const sideTotal = document.getElementById('sidebar-total');
            if (sideScore) sideScore.textContent = answeredCount;
            if (sideTotal) sideTotal.textContent = total;

            // Progress bar
            const progressPct = total > 0 ? Math.min(100, (answeredCount / total) * 100) : 0;
            const progressBar = document.getElementById('progress-bar');
            if (progressBar) progressBar.style.width = `${progressPct}%`;

            // Mobile drawer progress
            const mobileDrawerScore = document.getElementById('mobile-drawer-score');
            const mobileDrawerProgress = document.getElementById('mobile-drawer-progress');
            if (mobileDrawerScore) mobileDrawerScore.textContent = `${answeredCount}/${total}`;
            if (mobileDrawerProgress) mobileDrawerProgress.style.width = `${progressPct}%`;

            // Tab Badges
            const isExamInProgress = (Store.mode === 'exam' && !Store.examSubmitted);
            const countAll = total;
            let countWrong = 0;
            let countStarred = 0;

            questions.forEach(q => {
                if (!isExamInProgress) {
                    const ans = Store.userAnswers[q.uid];
                    if (ans && ans.isCorrect === false) countWrong++;
                }
                if (Store.starredIds.has(q.uid)) countStarred++;
            });

            const badgeAll = document.getElementById('tab-count-all');
            const badgeWrong = document.getElementById('tab-count-wrong');
            const badgeStarred = document.getElementById('tab-count-starred');

            if (badgeAll) badgeAll.textContent = countAll;
            if (badgeWrong) badgeWrong.textContent = countWrong;
            if (badgeStarred) badgeStarred.textContent = countStarred;

            // Search & filter stats
            const searchStats = document.getElementById('search-stats-text');
            const resetBtn = document.getElementById('reset-filters-btn');
            if (resetBtn) {
                resetBtn.style.display = Store.hasActiveFilters() ? 'inline-block' : 'none';
            }

            if (searchStats) {
                const rawKw = Store.searchKeyword.trim();
                const hasFilters = Store.hasActiveFilters();
                if (hasFilters) {
                    const matchedCount = Store.getDisplayQuestions().length;
                    const totalAllCount = Store.getAllQuestions().length || Store.data?.totalQuestions || 0;
                    const currentLabel = Store.isCustomMode ? '自訂試卷' : `${Store.currentYear} 試卷`;
                    const scopeName = Store.searchScope === 'all' ? `全體題庫 (${totalAllCount}題)` : currentLabel;
                    searchStats.textContent = `條件篩選/檢索: ${scopeName} 找到 ${matchedCount} 筆結果`;
                } else {
                    searchStats.textContent = '';
                }
            }
        },

        /**
         * Update navigation grids (Desktop sidebar & Mobile drawer).
         */
        updateNavigator() {
            const questions = Store.getCurrentPaperQuestions();
            ['question-nav-grid', 'mobile-nav-grid'].forEach(containerId => {
                const container = document.getElementById(containerId);
                if (!container) return;

                container.innerHTML = '';
                questions.forEach((q, idx) => {
                    const btn = document.createElement('button');
                    btn.id = `nav_${q.uid}_${containerId}`;
                    btn.textContent = idx + 1;
                    btn.className = this.getNavPillClass(q);

                    btn.onclick = () => {
                        const card = document.getElementById(`card_${q.uid}`);
                        if (card) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        if (containerId === 'mobile-nav-grid') {
                            this.toggleMobileNav(false);
                        }
                    };

                    container.appendChild(btn);
                });
            });
        },

        /**
         * Update a single item in the navigator grid for low-overhead feedback.
         */
        updateNavigatorItem(uid) {
            const questions = Store.getCurrentPaperQuestions();
            const q = questions.find(item => item.uid === uid);
            if (!q) return;

            ['question-nav-grid', 'mobile-nav-grid'].forEach(containerId => {
                const btn = document.getElementById(`nav_${uid}_${containerId}`);
                if (btn) {
                    btn.className = this.getNavPillClass(q);
                }
            });
        },

        getNavPillClass(q) {
            const ans = Store.userAnswers[q.uid];
            const isStarred = Store.starredIds.has(q.uid);
            const mode = Store.mode;

            const base = 'nav-pill h-7 rounded border text-xs font-semibold num flex items-center justify-center transition-colors ';

            if (mode === 'exam' && !Store.examSubmitted) {
                if (ans !== undefined) {
                    return base + 'bg-[#1d5fbf] text-white border-transparent';
                }
                return base + 'bg-white border-[#e6e6e6] text-[#0a0a0a] hover:bg-[#eeeeee]';
            }

            if (ans !== undefined) {
                if (ans.isCorrect === true) {
                    return base + 'bg-[#dcfae5] text-[#04250e] border-[#247b50]';
                } else if (ans.isCorrect === false) {
                    return base + 'bg-[#ffedea] text-[#831c1e] border-[#c4242a]';
                }
            }

            if (isStarred) {
                return base + 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]';
            }

            return base + 'bg-white border-[#e6e6e6] text-[#0a0a0a] hover:bg-[#eeeeee]';
        },

        toggleStar(uid) {
            if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(12);
            const isStarred = Store.toggleStar(uid);
            const icon = document.getElementById(`star_${uid}`);
            if (icon) {
                icon.className = isStarred ? 'fas fa-star text-[#92400e] text-sm' : 'far fa-star text-[#a3a3a3] text-sm';
            }
            this.updateDashboard();
            if (Store.currentTab === 'starred' && !isStarred) {
                this.renderAllQuestions();
            } else {
                this.updateNavigatorItem(uid);
            }
        },

        setTab(tab) {
            if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(8);
            Store.currentTab = tab;
            ['all', 'wrong', 'starred'].forEach(t => {
                const btn = document.getElementById(`tab-${t}`);
                if (!btn) return;
                if (t === tab) {
                    btn.className = 'flex-1 py-1.5 px-3 rounded text-xs sm:text-sm font-bold text-center whitespace-nowrap bg-white text-[#0a0a0a] border border-[#d4d4d4] flex items-center justify-center gap-1.5 transition-colors';
                } else {
                    btn.className = 'flex-1 py-1.5 px-3 rounded text-xs sm:text-sm font-medium text-center whitespace-nowrap text-[#525252] hover:text-[#0a0a0a] flex items-center justify-center gap-1.5 transition-colors';
                }
            });
            this.renderAllQuestions();
        },

        // --- In-card Inline Smooth Image Zoom (原地放大/縮回) ---

        toggleInlineZoom(imgEl) {
            if (!imgEl) return;
            const isZoomed = imgEl.classList.contains('img-zoomed');
            if (isZoomed) {
                imgEl.classList.remove('img-zoomed');
                if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(8);
            } else {
                imgEl.classList.add('img-zoomed');
                if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(12);
            }
        },

        // --- Search & OCR Helpers ---

        toggleSearchScope(isAll) {
            Store.searchScope = isAll ? 'all' : 'current';
            this.renderAllQuestions();
        },

        handleTopicFilterChange(topicCode) {
            Store.setFilterTopic(topicCode);
            this.renderAllQuestions();
            this.updateDashboard();
        },

        handleDifficultyFilterChange(diffCode) {
            Store.setFilterDifficulty(diffCode);
            this.renderAllQuestions();
            this.updateDashboard();
        },

        handleCorrectRateFilterChange(rateRangeId) {
            Store.setFilterCorrectRate(rateRangeId);
            this.renderAllQuestions();
            this.updateDashboard();
        },

        resetAllFilters() {
            Store.resetFilters();
            const topicSel = document.getElementById('filter-topic');
            if (topicSel) topicSel.value = 'all';
            const diffSel = document.getElementById('filter-difficulty');
            if (diffSel) diffSel.value = 'all';
            const crSel = document.getElementById('filter-correct-rate');
            if (crSel) crSel.value = 'all';
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';

            this.renderAllQuestions();
            this.updateDashboard();
            this.showToast('已重設所有篩選條件與關鍵字', 'info');
        },

        toggleTextPreview(uid) {
            const box = document.getElementById(`ocr_box_${uid}`);
            if (box) box.classList.toggle('hidden');
        },

        /**
         * Highlight keywords in pre-escaped text safely without breaking HTML entities
         * or corrupting previously inserted <mark> tags.
         * @param {string} escapedText - Already escaped HTML string
         * @param {string} kw - Search keyword
         * @returns {string} String with highlighted marks
         */
        highlightKeywords(escapedText, kw) {
            if (!escapedText || !kw || !kw.trim()) return escapedText || '';

            // Extract valid non-numeric tokens, sort longest first, and deduplicate
            const rawTokens = kw.trim().split(/\s+/).filter(tok => tok && !/^\d+$/.test(tok) && !/^(?:q|第)\d+(?:題)?$/i.test(tok));
            if (rawTokens.length === 0) return escapedText;

            const uniqueEscapedPatterns = Array.from(
                new Set(rawTokens.map(tok => escapeHtml(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
            ).sort((a, b) => b.length - a.length);

            // Single-pass combined regex prevents matching inside injected <mark> attributes
            // Negative lookahead avoids matching inside HTML character entities (&lt;, &gt;, &amp;, &quot;, &#39;)
            const combinedPattern = `(${uniqueEscapedPatterns.join('|')})(?![^&;]*;)`;
            const re = new RegExp(combinedPattern, 'gi');
            return escapedText.replace(re, '<mark class="bg-amber-200 text-amber-950 font-bold px-1 rounded">$1</mark>');
        },

        toggleMobileNav(forceState) {
            if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(8);
            const drawer = document.getElementById('mobile-nav-drawer');
            const content = document.getElementById('mobile-drawer-content');
            if (!drawer || !content) return;

            const isOpening = forceState !== undefined ? forceState : drawer.classList.contains('hidden');

            if (isOpening) {
                drawer.classList.remove('hidden');
                requestAnimationFrame(() => {
                    content.classList.remove('translate-x-full');
                });
            } else {
                content.classList.add('translate-x-full');
                setTimeout(() => {
                    drawer.classList.add('hidden');
                }, 220);
            }
        },

        // --- Modals ---

        toggleModal(modalId, show) {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            if (show) {
                modal.classList.add('active');
                if (modalId === 'history-modal') {
                    this.renderHistoryList();
                } else if (modalId === 'custom-exam-modal') {
                    this.renderCustomExamYearList();
                    this.renderCustomExamFilters();
                }
            } else {
                modal.classList.remove('active');
            }
        },

        /**
         * Animated number counter from start to end value.
         */
        animateCountUp(element, endVal, duration = 600, suffix = '') {
            if (!element) return;
            const startVal = 0;
            const startTime = performance.now();
            const step = (currentTime) => {
                const progress = Math.min((currentTime - startTime) / duration, 1);
                // Ease out quad
                const easeProgress = 1 - (1 - progress) * (1 - progress);
                const currentVal = Math.round(startVal + (endVal - startVal) * easeProgress);
                element.textContent = `${currentVal}${suffix}`;
                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    element.textContent = `${endVal}${suffix}`;
                }
            };
            requestAnimationFrame(step);
        },

        showResultModal(record, gradeInfo) {
            const scoreEl = document.getElementById('modal-score');
            const wrongEl = document.getElementById('modal-wrong');
            const accEl = document.getElementById('modal-accuracy');
            const gradeLevel = document.getElementById('grade-level');
            const gradeDesc = document.getElementById('grade-desc');
            const gradeCard = document.getElementById('grade-card');
            const retryWrongBtn = document.getElementById('modal-retry-wrong-btn');
            const retryWrongLabel = document.getElementById('modal-retry-wrong-label');

            const wrongCount = record.total - record.score;

            // Animated score count-up
            this.animateCountUp(scoreEl, record.score, 600);
            this.animateCountUp(wrongEl, wrongCount, 600);
            this.animateCountUp(accEl, record.accuracy, 750, '%');

            if (gradeLevel) gradeLevel.textContent = gradeInfo.level;
            if (gradeDesc) gradeDesc.textContent = gradeInfo.desc;
            if (gradeCard) {
                gradeCard.className = `p-3.5 rounded-md mb-3 text-center border border-[#e6e6e6] text-white ${gradeInfo.color || 'bg-[#141414]'}`;
            }

            // Retry wrong questions button
            if (retryWrongBtn) {
                if (wrongCount > 0) {
                    retryWrongBtn.classList.remove('hidden');
                    retryWrongBtn.classList.add('flex');
                    if (retryWrongLabel) {
                        retryWrongLabel.textContent = `立即重溫本次錯題 (共 ${wrongCount} 題)`;
                    }
                } else {
                    retryWrongBtn.classList.add('hidden');
                    retryWrongBtn.classList.remove('flex');
                }
            }

            this.toggleModal('result-modal', true);
        },

        /**
         * Review wrong questions after exam submission while keeping user's answers and mistakes intact.
         */
        reviewWrongQuestions() {
            this.toggleModal('result-modal', false);
            // Switch to wrong questions tab to filter and inspect mistakes
            this.setTab('wrong');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const wrongCount = Store.getDisplayQuestions().length;
            this.showToast(`已為您篩選出 ${wrongCount} 道錯題，可檢閱詳解或點擊「重新作答」重試！`, 'info');
        },

        // --- Option Strike-through (刪去法: 電腦右鍵 / 手機長按 380ms) ---
        longPressTimer: null,
        longPressFired: false,

        handleOptionTouchStart(e, uid, optionIndex) {
            this.longPressFired = false;
            clearTimeout(this.longPressTimer);
            this.longPressTimer = setTimeout(() => {
                this.longPressFired = true;
                this.toggleStrikeThrough(uid, optionIndex);
                if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(18);
            }, 380);
        },

        handleOptionTouchEnd(e) {
            clearTimeout(this.longPressTimer);
            if (this.longPressFired) {
                // Prevent synthetic click from triggering answer selection
                if (e && e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
        },

        handleOptionTouchCancel() {
            clearTimeout(this.longPressTimer);
            this.longPressFired = false;
        },

        handleOptionContextMenu(uid, optionIndex) {
            this.toggleStrikeThrough(uid, optionIndex);
        },

        toggleStrikeThrough(uid, optionIndex) {
            const isEliminated = Store.toggleEliminateOption(uid, optionIndex);
            const btn = document.getElementById(`btn_${uid}_${optionIndex}`);
            if (btn) {
                if (isEliminated) {
                    btn.classList.add('opt-eliminated');
                    if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(12);
                } else {
                    btn.classList.remove('opt-eliminated');
                    if (typeof Quiz !== 'undefined' && Quiz.vibrate) Quiz.vibrate(10);
                }
            }
        },

        renderHistoryList() {
            const listEl = document.getElementById('history-list');
            if (!listEl) return;

            const history = Store.getHistory();
            if (history.length === 0) {
                listEl.innerHTML = '<div class="text-center py-8 text-[#525252] text-xs font-semibold">尚無測驗紀錄</div>';
                return;
            }

            listEl.innerHTML = history.map(item => `
                <div class="p-3 mb-2 rounded-md bg-[#f4f6f8] border border-[#e6e6e6] flex items-center justify-between">
                    <div>
                        <div class="font-bold text-xs text-[#0a0a0a]">${escapeHtml(item.year || '')}</div>
                        <div class="text-xs text-[#525252] mt-0.5">${escapeHtml(item.date || '')} • 用時 ${Quiz.formatTime(item.duration || 0)}</div>
                    </div>
                    <div class="text-right">
                        <div class="num font-bold text-sm text-[#0a0a0a]">${item.score}/${item.total} (${item.accuracy}%)</div>
                        <span class="inline-block text-xs font-bold px-1.5 py-0.5 rounded bg-[#141414] text-white mt-0.5 num">${escapeHtml(item.grade || '')}</span>
                    </div>
                </div>
            `).join('');
        },

        renderCustomExamFilters() {
            const topicContainer = document.getElementById('custom-topic-list');
            const diffContainer = document.getElementById('custom-difficulty-list');

            const topics = Store.data?.meta?.topics || [
                { code: 'cit_1', nameZh: '資訊處理', count: 0 },
                { code: 'cit_2', nameZh: '電腦系統基礎', count: 0 },
                { code: 'cit_3', nameZh: '互聯網及其應用', count: 0 },
                { code: 'cit_4', nameZh: '計算思維與程式編寫', count: 0 },
                { code: 'cit_5', nameZh: '資訊及通訊科技對社會的影響', count: 0 }
            ];

            if (topicContainer) {
                topicContainer.innerHTML = topics.map((t, idx) => `
                    <label class="flex items-center gap-2 p-1.5 rounded bg-white border border-[#e6e6e6] cursor-pointer hover:bg-[#fafafa] ${idx === 4 ? 'sm:col-span-2' : ''}">
                        <input type="checkbox" name="custom-topic" value="${escapeHtml(t.code)}" class="w-3.5 h-3.5 rounded text-[#141414] focus:ring-[#141414]" checked>
                        <span class="font-medium text-[#0a0a0a]">${escapeHtml(t.nameZh)} (${t.count}題)</span>
                    </label>
                `).join('');
            }

            const diffs = Store.data?.meta?.difficulties || [
                { code: 1, label: '容易', count: 0 },
                { code: 2, label: '普通', count: 0 },
                { code: 3, label: '困難', count: 0 }
            ];

            if (diffContainer) {
                diffContainer.innerHTML = diffs.map(d => `
                    <label class="flex items-center gap-2 p-1.5 rounded bg-white border border-[#e6e6e6] cursor-pointer hover:bg-[#fafafa]">
                        <input type="checkbox" name="custom-difficulty" value="${escapeHtml(String(d.code))}" class="w-3.5 h-3.5 rounded text-[#141414] focus:ring-[#141414]" checked>
                        <span class="font-medium text-[#0a0a0a]">${escapeHtml(d.label)} (${d.count}題)</span>
                    </label>
                `).join('');
            }
        },

        renderCustomExamYearList() {
            const listEl = document.getElementById('custom-year-list');
            if (!listEl) return;

            listEl.innerHTML = Store.years.map(yr => `
                <label class="cursor-pointer flex items-center gap-2 p-1.5 rounded hover:bg-[#eeeeee] transition-colors">
                    <input type="checkbox" name="custom-year" value="${escapeHtml(yr)}" class="w-4 h-4 rounded text-[#141414] focus:ring-[#141414] custom-year-checkbox" checked>
                    <span class="text-xs font-semibold text-[#0a0a0a] num">${escapeHtml(yr)}</span>
                </label>
            `).join('');
        },

        toggleAllCustomYears() {
            const cbs = document.querySelectorAll('.custom-year-checkbox');
            const allChecked = Array.from(cbs).every(c => c.checked);
            cbs.forEach(c => c.checked = !allChecked);
        },

        toggleAllCustomTopics() {
            const cbs = document.querySelectorAll('input[name="custom-topic"]');
            if (!cbs || cbs.length === 0) return;
            const allChecked = Array.from(cbs).every(c => c.checked);
            cbs.forEach(c => c.checked = !allChecked);
        },

        toggleAllCustomDifficulties() {
            const cbs = document.querySelectorAll('input[name="custom-difficulty"]');
            if (!cbs || cbs.length === 0) return;
            const allChecked = Array.from(cbs).every(c => c.checked);
            cbs.forEach(c => c.checked = !allChecked);
        },

        // --- Font Scale Adjuster ---

        initFontScale() {
            const saved = Store.StorageUtil ? Store.StorageUtil.getItem(Store.STORAGE_KEYS.FONT_SCALE) : null;
            if (saved) {
                this.fontScale = parseFloat(saved) || 1.0;
                this.applyFontScale();
            }
        },

        adjustFontSize(direction) {
            if (direction === 'increase' && this.fontScale < 1.3) {
                this.fontScale = Math.round((this.fontScale + 0.1) * 10) / 10;
            } else if (direction === 'decrease' && this.fontScale > 0.8) {
                this.fontScale = Math.round((this.fontScale - 0.1) * 10) / 10;
            }
            if (Store.StorageUtil) {
                Store.StorageUtil.setItem(Store.STORAGE_KEYS.FONT_SCALE, this.fontScale.toFixed(1));
            }
            this.applyFontScale();
        },

        applyFontScale() {
            document.documentElement.style.fontSize = `${16 * this.fontScale}px`;
        }
    };

    global.UI = UI;
})(typeof window !== 'undefined' ? window : this);
