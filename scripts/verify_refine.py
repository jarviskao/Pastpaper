import sys, json, re

sys.stdout.reconfigure(encoding='utf-8')

with open('data/ocr.json', 'r', encoding='utf-8') as f:
    ocr = json.load(f)

with open('data/papers.json', 'r', encoding='utf-8') as f:
    papers = json.load(f)

print('=== 1. 基本結構驗證 ===')
print(f'ocr.json 題目總數: {len(ocr)}')
print(f'papers.json 試卷年份數: {papers["totalYears"]}, 題目總數: {papers["totalQuestions"]}')

assert len(ocr) == 835, f'Expected 835, got {len(ocr)}'
assert papers['totalQuestions'] == 835, f'Expected 835 in papers, got {papers["totalQuestions"]}'

empty_q = 0
empty_opts = 0
q_lengths = []

for uid, item in ocr.items():
    q = item.get('question', '').strip()
    if not q:
        empty_q += 1
    q_lengths.append(len(q))
    opts = item.get('options', {})
    for letter in ['A', 'B', 'C', 'D']:
        if not opts.get(letter, '').strip():
            empty_opts += 1

print(f'空題目數: {empty_q}')
print(f'空選項數: {empty_opts}')
print(f'題目平均長度: {sum(q_lengths)/len(q_lengths):.1f} 字元 (最小: {min(q_lengths)}, 最大: {max(q_lengths)})')

print('\n=== 2. 還原率與一致性驗證 ===')
restored_rate = ((835 - empty_q) / 835) * 100
option_restored_rate = ((835 * 4 - empty_opts) / (835 * 4)) * 100
print(f'題目題幹完整還原率: {restored_rate:.2f}% (目標 >= 90%)')
print(f'選項完整還原率: {option_restored_rate:.2f}% (目標 >= 90%)')

print('\n=== 3. 搜尋索引測試 ===')
search_test_queries = ['志明', '試算表', '數據庫', '算法', '流程圖', '二進制', 'unicode', 'html', '目標儲存格']
all_search_texts = []
for p in papers['papers'].values():
    for q in p['questions']:
        all_search_texts.append(q['searchText'])

for query in search_test_queries:
    hit_count = sum(1 for st in all_search_texts if query.lower() in st)
    print(f'  搜尋 "{query}": 命中 {hit_count} 題')
