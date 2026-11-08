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
         * Refined Haptic Vibration Hierarchy:
         * - light (8ms): tab switch, drawer toggle, small UI control
         * - medium (12ms): exam option select, star/unstar, strike-through
         * - success ([12, 28, 18]): double chirp pulse for correct answer
         * - error ([36, 40, 36]): firm rejection pulse for wrong answer
         * - submit ([24, 40, 24, 40, 32]): final exam submission fanfare
         * @param {number|number[]} pattern - Vibration duration in ms or pattern array
         */
        vibrate(pattern = 10) {
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
                    Store.currentStreak++;
                    if (Store.currentStreak > Store.maxStreak) {
                        Store.maxStreak = Store.currentStreak;
                    }
                    this.vibrate([12, 28, 18]);
                    // Streak celebration toasts
                    if (Store.currentStreak === 3 && typeof UI !== 'undefined') {
                        UI.showToast('🔥 連續答對 3 題！保持手感！', 'success');
                    } else if (Store.currentStreak === 5 && typeof UI !== 'undefined') {
                        UI.showToast('⚡ 5 連勝！實力勢不可擋！', 'success');
                    } else if (Store.currentStreak === 10 && typeof UI !== 'undefined') {
                        UI.showToast('👑 達成 10 連霸！簡直是神人！', 'success');
                    }
                } else if (isCorrect === false) {
                    Store.currentStreak = 0;
                    this.vibrate([36, 40, 36]);
                }
                if (typeof UI !== 'undefined' && UI.revealQuestionAnswer) {
                    UI.revealQuestionAnswer(question, optionIndex, false);
                }
            } else if (mode === 'exam') {
                this.vibrate(12);
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
            this.vibrate([30, 50, 30]);
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

            // Tier-based celebration confetti on submission
            if (accuracy >= 65 && typeof confetti === 'function') {
                try {
                    if (accuracy >= 87.5) {
                        // Level 5** Master celebration (double burst from left and right)
                        confetti({
                            particleCount: 100,
                            angle: 60,
                            spread: 70,
                            origin: { x: 0.1, y: 0.7 }
                        });
                        setTimeout(() => {
                            confetti({
                                particleCount: 100,
                                angle: 120,
                                spread: 70,
                                origin: { x: 0.9, y: 0.7 }
                            });
                        }, 200);
                    } else if (accuracy >= 75) {
                        // Level 5* & 5 celebration
                        confetti({
                            particleCount: 120,
                            spread: 80,
                            origin: { y: 0.6 }
                        });
                    } else {
                        // Level 4 solid pass celebration
                        confetti({
                            particleCount: 60,
                            spread: 50,
                            origin: { y: 0.6 }
                        });
                    }
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
                return { level: 'Level 1', color: 'bg-[#141414]', desc: '需要更多練習', percent: 0 };
            }
            const percent = (score / total) * 100;

            if (percent >= 87.5) {
                return { level: 'Level 5**', color: 'bg-[#141414]', desc: '極佳水準，穩奪全港頂尖等級', percent };
            } else if (percent >= 80) {
                return { level: 'Level 5*', color: 'bg-[#1d5fbf]', desc: '表現優秀，具備頂級實力', percent };
            } else if (percent >= 70) {
                return { level: 'Level 5', color: 'bg-[#1d5fbf]', desc: '實力堅強，保持穩定即可奪星', percent };
            } else if (percent >= 60) {
                return { level: 'Level 4', color: 'bg-[#247b50]', desc: '基礎扎實，注意錯題細節可再衝刺', percent };
            } else if (percent >= 50) {
                return { level: 'Level 3', color: 'bg-[#247b50]', desc: '及格達標，建議針對弱項深入溫習', percent };
            } else if (percent >= 40) {
                return { level: 'Level 2', color: 'bg-[#92400e]', desc: '基本及格，需加強關鍵觀念與詞彙', percent };
            } else {
                return { level: 'Level 1 / U', color: 'bg-[#c4242a]', desc: '未達水平，建議配合溫習模式重溫題庫', percent };
            }
        },

        /**
         * Generate a randomized or structured custom exam set.
         * @param {Object} options
         * @param {string[]} options.selectedYears - Array of years to pick from
         * @param {number} [options.count=40] - Target question count (e.g. 40)
         * @param {boolean} [options.shuffleQ=true] - Whether to shuffle question sequence
         * @param {boolean} [options.shuffleO=false] - Whether to shuffle A/B/C/D option sequence
         * @param {string|string[]} [options.topicFilter='all'] - Topic code filter
         * @param {string|number|Array} [options.difficultyFilter='all'] - Difficulty code filter (1, 2, 3)
         * @param {string} [options.correctRateFilter='all'] - Correct rate range filter ('all'|'high'|'medium'|'challenging'|'extreme')
         * @returns {boolean} Success status
         */
        generateCustomExam({
            selectedYears,
            count = 40,
            shuffleQ = true,
            shuffleO = false,
            topicFilter = 'all',
            difficultyFilter = 'all',
            correctRateFilter = 'all'
        }) {
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

            // Collect questions pool from selected years
            let pool = [];
            for (const yr of selectedYears) {
                const paper = Store.data.papers[yr];
                if (paper && Array.isArray(paper.questions)) {
                    pool.push(...paper.questions);
                }
            }

            // Filter by topic if specified
            if (topicFilter && topicFilter !== 'all') {
                const topicArr = Array.isArray(topicFilter) ? topicFilter : [topicFilter];
                pool = pool.filter(q => q.topic && topicArr.includes(q.topic.code));
            }

            // Filter by difficulty if specified
            if (difficultyFilter && difficultyFilter !== 'all') {
                const diffArr = (Array.isArray(difficultyFilter) ? difficultyFilter : [difficultyFilter]).map(Number);
                pool = pool.filter(q => q.difficulty && diffArr.includes(q.difficulty.code));
            }

            // Filter by correct rate if specified
            if (correctRateFilter && correctRateFilter !== 'all') {
                pool = pool.filter(q => {
                    if (typeof q.correctRate !== 'number') return false;
                    switch (correctRateFilter) {
                        case 'high': return q.correctRate >= 70;
                        case 'medium': return q.correctRate >= 50 && q.correctRate < 70;
                        case 'challenging': return q.correctRate < 50;
                        case 'extreme': return q.correctRate < 30;
                        default: return true;
                    }
                });
            }

            if (pool.length === 0) {
                const msg = '所選條件（年份/課題/難度/答對率）下無符合題目，請放寬篩選！';
                if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast(msg, 'warning');
                } else if (typeof alert !== 'undefined') {
                    alert(msg);
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
            const m = Math.floor(s / 60).toString().padStart(2, '0'); // taste-skill-ignore
            const remSec = (s % 60).toString().padStart(2, '0'); // taste-skill-ignore
            return `${m}:${remSec}`;
        }
    };

    global.Quiz = Quiz;
})(typeof window !== 'undefined' ? window : this);
