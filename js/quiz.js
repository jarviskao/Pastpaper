/**
 * js/quiz.js
 * Quiz Engine: answer evaluation, exam scoring, grading algorithms,
 * drift-free precision timer, and custom test paper generator.
 */

(function (global) {
    'use strict';

    const Quiz = {
        timerHandle: null,

        /**
         * Haptic vibration feedback helper with defensive capability check.
         * @param {number|number[]} pattern - Vibration duration in ms or pattern array
         */
        vibrate(pattern = 100) {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try {
                    navigator.vibrate(pattern);
                } catch (e) {
                    // Ignored if user interaction policy blocks vibration
                }
            }
        },

        /**
         * Handle user option click on a question.
         * @param {string} uid - Unique question ID (e.g. '2024_q_01')
         * @param {number} optionIndex - Visual index in currently rendered options (0-3)
         */
        handleOptionClick(uid, optionIndex) {
            const mode = Store.mode;
            if (mode === 'study') return;
            if (mode === 'exam' && Store.examSubmitted) return;

            // In practice mode, lock once answered
            if (mode === 'practice' && Store.userAnswers[uid] !== undefined) return;

            let question = Store.getCurrentPaperQuestions().find(q => q.uid === uid);
            if (!question && Store.searchScope === 'all') {
                question = Store.getAllQuestions().find(q => q.uid === uid);
            }
            if (!question || !Array.isArray(question.options) || !question.options[optionIndex]) return;

            const selectedOption = question.options[optionIndex];
            // Evaluate correctness: option.part is 1-based (1=A, 2=B, 3=C, 4=D)
            const isCorrect = (typeof question.answer === 'number' && question.answer >= 0)
                ? (selectedOption.part - 1 === question.answer)
                : null;

            Store.userAnswers[uid] = {
                visualIndex: optionIndex,
                selectedPart: selectedOption.part,
                isCorrect: isCorrect,
                answeredAt: Date.now()
            };

            if (mode === 'practice') {
                if (isCorrect === true) {
                    Store.score++;
                } else if (isCorrect === false) {
                    this.vibrate(200);
                }
                if (typeof UI !== 'undefined' && UI.revealQuestionAnswer) {
                    UI.revealQuestionAnswer(question, optionIndex, false);
                }
            } else if (mode === 'exam') {
                if (typeof UI !== 'undefined' && UI.markQuestionSelected) {
                    UI.markQuestionSelected(question, optionIndex);
                }
                Store.saveExamSession();
            }

            if (typeof UI !== 'undefined') {
                if (UI.updateDashboard) UI.updateDashboard();
                if (UI.updateNavigatorItem) UI.updateNavigatorItem(uid);
            }
        },

        /**
         * Submit active Exam session and compute comprehensive score report.
         * @param {boolean} [forceSubmit=false] - Skip confirmation prompt if true
         * @returns {Object|null} Result summary if submitted, null otherwise
         */
        submitExam(forceSubmit = false) {
            if (Store.examSubmitted) return null;

            const questions = Store.getCurrentPaperQuestions();
            const total = questions.length;
            if (total === 0) return null;

            const answeredCount = questions.reduce((acc, q) => acc + (Store.userAnswers[q.uid] !== undefined ? 1 : 0), 0);
            if (!forceSubmit && answeredCount < total) {
                const unAnswered = total - answeredCount;
                const confirmed = window.confirm(`尚有 ${unAnswered} 題未作答，確定要現在交卷嗎？`);
                if (!confirmed) return null;
            }

            this.stopTimer();
            Store.examSubmitted = true;
            Store.clearExamSession();

            // Calculate precise score
            let correctCount = 0;
            let wrongCount = 0;

            questions.forEach(q => {
                const userAns = Store.userAnswers[q.uid];
                if (userAns && userAns.isCorrect === true) {
                    correctCount++;
                } else {
                    wrongCount++;
                }
            });

            Store.score = correctCount;
            const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
            const gradeInfo = this.predictGrade(correctCount, total);

            // Record history item
            const record = {
                id: 'exam_' + Date.now(),
                year: Store.isCustomMode ? '自訂試卷' : Store.currentYear,
                mode: Store.mode,
                score: correctCount,
                total: total,
                accuracy: accuracy,
                grade: gradeInfo.level,
                duration: Store.seconds,
                date: new Date().toLocaleString('zh-HK', { hour12: false })
            };
            Store.saveHistoryItem(record);

            // UI updates
            if (typeof UI !== 'undefined') {
                if (UI.updateDashboard) UI.updateDashboard();
                if (UI.renderAllQuestions) UI.renderAllQuestions();
                if (UI.updateNavigator) UI.updateNavigator();
                if (UI.showResultModal) UI.showResultModal(record, gradeInfo);
            }

            // Confetti celebration on high score
            if (accuracy >= 75 && typeof confetti === 'function') {
                try {
                    confetti({
                        particleCount: 120,
                        spread: 80,
                        origin: { y: 0.6 }
                    });
                } catch (e) {
                    // Ignore confetti rendering errors
                }
            }

            return { record, gradeInfo };
        },

        /**
         * DSE MC Paper 1A Grade Prediction based on standard Hong Kong cut-offs.
         * @param {number} score - Correct answers count
         * @param {number} total - Total question count
         * @returns {Object} { level, color, desc, percent }
         */
        predictGrade(score, total) {
            if (total <= 0) {
                return { level: 'Level 1', color: 'from-slate-600 to-slate-800', desc: '需要更多練習', percent: 0 };
            }
            const percent = (score / total) * 100;

            if (percent >= 87.5) {
                return { level: 'Level 5**', color: 'from-amber-500 to-yellow-600', desc: '極佳水準！穩奪全港頂尖等級 🏆', percent };
            } else if (percent >= 80) {
                return { level: 'Level 5*', color: 'from-indigo-600 to-purple-600', desc: '表現優秀！具備頂級實力 🚀', percent };
            } else if (percent >= 70) {
                return { level: 'Level 5', color: 'from-blue-600 to-indigo-600', desc: '實力堅強！保持穩定即可奪星 ✨', percent };
            } else if (percent >= 60) {
                return { level: 'Level 4', color: 'from-emerald-600 to-teal-600', desc: '基礎扎實！注意錯題細節可再衝刺 📈', percent };
            } else if (percent >= 50) {
                return { level: 'Level 3', color: 'from-cyan-600 to-blue-600', desc: '及格達標！建議針對弱項深入溫習 💡', percent };
            } else if (percent >= 40) {
                return { level: 'Level 2', color: 'from-orange-500 to-amber-600', desc: '基本及格！需加強關鍵觀念與詞彙 ⚠️', percent };
            } else {
                return { level: 'Level 1 / U', color: 'from-red-600 to-rose-700', desc: '未達水平，建議配合溫習模式重溫題庫 📖', percent };
            }
        },

        /**
         * Generate a randomized or structured custom exam set.
         * @param {Object} options
         * @param {string[]} options.selectedYears - Array of years to pick from
         * @param {number} options.count - Target question count (e.g. 40)
         * @param {boolean} options.shuffleQ - Whether to shuffle question sequence
         * @param {boolean} options.shuffleO - Whether to shuffle A/B/C/D option sequence
         * @returns {boolean} Success status
         */
        generateCustomExam({ selectedYears, count = 40, shuffleQ = true, shuffleO = false }) {
            if (!Array.isArray(selectedYears) || selectedYears.length === 0) {
                if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast('請至少選擇一個年份！', 'warning');
                } else if (typeof alert !== 'undefined') {
                    alert('請至少選擇一個年份！');
                }
                return false;
            }

            if (!Store.data?.papers) {
                return false;
            }

            // Collect questions pool
            let pool = [];
            for (const yr of selectedYears) {
                const paper = Store.data.papers[yr];
                if (paper && Array.isArray(paper.questions)) {
                    pool.push(...paper.questions);
                }
            }

            if (pool.length === 0) {
                if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast('選定年份無題目可用！', 'warning');
                } else if (typeof alert !== 'undefined') {
                    alert('選定年份無題目可用！');
                }
                return false;
            }

            // Shuffle pool and take subset
            pool = this.shuffleArray([...pool]);
            const targetCount = Math.min(count, pool.length);
            let selected = pool.slice(0, targetCount);

            // Sort chronologically if shuffleQ is false
            if (!shuffleQ) {
                selected.sort((a, b) => {
                    if (a.year !== b.year) return Number(b.year) - Number(a.year);
                    return a.qNum - b.qNum;
                });
            }

            // Deep clone questions & options
            const customQuestions = selected.map((q, idx) => {
                const qCopy = {
                    ...q,
                    paperIndex: idx,
                    customIndex: idx,
                    optionsShuffled: shuffleO,
                    options: q.options.map(opt => ({ ...opt }))
                };

                if (shuffleO) {
                    qCopy.options = this.shuffleArray(qCopy.options);
                    qCopy.options.forEach((opt, oIdx) => {
                        opt.letter = String.fromCharCode(65 + oIdx);
                    });
                }

                return qCopy;
            });

            Store.isCustomMode = true;
            Store.customQuestionSet = customQuestions;
            Store.currentYear = 'custom';
            Store.resetQuizState();
            this.startTimer();

            return true;
        },

        /**
         * In-place Fisher-Yates array shuffle.
         * @param {Array} arr
         * @returns {Array} Shuffled array
         */
        shuffleArray(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = arr[i];
                arr[i] = arr[j];
                arr[j] = temp;
            }
            return arr;
        },

        // --- Drift-Free Precision Timer ---

        startTimer() {
            this.stopTimer();

            // Calibrate start timestamp to prevent sleep/background drift
            Store.timerStartTime = Date.now();
            Store.timerAccumulatedSeconds = Store.seconds || 0;
            this.updateTimerDisplay();

            this.timerHandle = setInterval(() => {
                if (Store.timerStartTime) {
                    const elapsed = Math.floor((Date.now() - Store.timerStartTime) / 1000);
                    Store.seconds = Store.timerAccumulatedSeconds + elapsed;
                } else {
                    Store.seconds++;
                }

                this.updateTimerDisplay();

                // Periodic auto-save in exam mode (every 5 seconds)
                if (Store.mode === 'exam' && !Store.examSubmitted && Store.seconds % 5 === 0) {
                    Store.saveExamSession();
                }
            }, 1000);
        },

        stopTimer() {
            if (this.timerHandle) {
                clearInterval(this.timerHandle);
                this.timerHandle = null;
            }
            if (Store.timerStartTime) {
                const elapsed = Math.floor((Date.now() - Store.timerStartTime) / 1000);
                Store.seconds = Store.timerAccumulatedSeconds + elapsed;
                Store.timerAccumulatedSeconds = Store.seconds;
                Store.timerStartTime = null;
            }
        },

        updateTimerDisplay() {
            const text = this.formatTime(Store.seconds);
            if (typeof document !== 'undefined') {
                const el = document.getElementById('timer-display');
                if (el) el.textContent = text;
            }
        },

        formatTime(sec) {
            const s = Math.max(0, Math.floor(sec || 0));
            const m = Math.floor(s / 60).toString().padStart(2, '0');
            const remSec = (s % 60).toString().padStart(2, '0');
            return `${m}:${remSec}`;
        }
    };

    global.Quiz = Quiz;
})(typeof window !== 'undefined' ? window : this);
