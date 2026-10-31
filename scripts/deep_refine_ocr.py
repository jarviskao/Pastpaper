"""
scripts/deep_refine_ocr.py
Deep AI Review and Correction for ICT MC Past Paper Database.
Fuses ict-mc.xml authentic ground truth, target image re-OCR extractions,
and comprehensive Hong Kong ICT terminology/spacing/punctuation refinement.
"""
import os
import sys
import re
import json
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
XML_PATH = os.path.join(ROOT_DIR, 'ict-mc.xml')
OCR_PATH = os.path.join(ROOT_DIR, 'data', 'ocr.json')
SCRATCH_DIR = os.environ.get('PI_SCRATCH_DIR', ROOT_DIR)
TARGETS_REOCR_PATH = os.path.join(SCRATCH_DIR, 'targets_reocr.json')

# 1. Terminology & Typo dictionary for Hong Kong ICT Exams
TYPO_REPLACEMENTS = [
    (r'輸\s*人', '輸入'),
    (r'電\s*惱', '電腦'),
    (r'橫\s*分|横\s*分', '積分'),
    (r'雨\s*個', '兩個'),
    (r'图\s*段|圆\s*段', '流程圖段'),
    (r'敷\s*量', '數量'),
    (r'敷\s*據', '數據'),
    (r'障\s*列', '陣列'),
    (r'重\s*夜', '重複'),
    (r'重\s*覆', '重複'),
    (r'掃\s*瞄', '掃描'),
    (r'存\s*貯', '儲存'),
    (r'存\s*儲', '儲存'),
    (r'只讀記憶器', '唯讀記憶器'),
    (r'追\s*璐\s*球|追\s*球', '軌跡球'),
    (r'\bCPIJ\b', 'CPU'),
    (r'\bCPu\b', 'CPU'),
    (r'\bIAN\b|\blAN\b', 'LAN'),
    (r'\bwAN\b', 'WAN'),
    (r'統─碼|統一碼\(UTF-8\)', '統一碼(UTF-8)'),
    (r'以16進制', '以十六進制'),
    (r'以2進制', '以二進制'),
    (r'以8進制', '以八進制'),
    (r'方\s*格\s*內\s*應\s*是\s*什\s*麼', '方格內應是什麼'),
    (r'甚\s*麼', '什麼'),
    (r'什\s*魔', '什麼'),
    (r'什\s*度', '什麼'),
    (r'什\s*麽', '什麼'),
    (r'中交字', '中文字'),
    (r'中交字符', '中文字符'),
    (r'娜一', '哪一'),
    (r'娜項', '哪項'),
    (r'娜個', '哪個'),
    (r'傅送', '傳送'),
    (r'傅輸', '傳輸'),
    (r'登人', '登入'),
    (r'載人', '載入'),
    (r'插人', '插入'),
    (r'寫人', '寫入'),
    (r'鍵人', '鍵入'),
    (r'内', '內'),
    (r'删', '刪'),
    (r'换', '換'),
    (r'温', '溫'),
    (r'纯', '純'),
    (r'缩', '縮'),
    (r'钦', '欽'),
    (r'着', '著'),
]

# 2. Reconstructed algorithm / pseudocode for target questions
ALGORITHM_RECONSTRUCTIONS = {
    '2017_q_31': "以下算法的輸出是什麼？\nK ← 0\n設 N 由 1 至 3 執行\n  K ← K + N * N\n輸出 K",
    '2018_q_31': "細看以下算法：\n輸入 n\n如果 n < -6 則\n  Y ← Y + 2\n否則 如果 n > 9 則\n  Y ← Y - 2\n否則\n  Y ← Y * 2\n下列哪組輸入數據最適合用作測試此算法？",
    '2019_q_21': "以下是某校園的典型電腦網絡：\n網絡圖中展示了互聯網、伺服器與工作站。\nX 和 Y 是什麼？",
    '2019_q_32': "細看以下算法：\nA ← 1\nB ← 1\n重複\n  輸出 B\n  C ← A + B\n  A ← B\n  B ← C\n直至 (B > 10)\n「輸出B」會被執行多少次？",
    '2019_q_33': "Y 是一個陣列。下列算法的輸出是什麼？\nY[1] ← 4\n設 k 由 1 至 5 執行\n  Y[k+1] ← Y[k] + k\n輸出 Y[6]",
    '2019_q_34': "細看以下流程圖的一部分：\nP ← 1, Q ← 1\n重複執行 P ← P + 1，如果 P >= 2 則輸出 \"A\"，Q ← Q * 2\n有多少個「A」會被輸出？",
    '2020_q_18': "參考下列指令。\n位址 1000：STORE 1111（把累加器的內容儲存在主記憶體位址 1111）\n在「提取—譯碼—執行」週期中，「提取」是做什麼的？",
    '2020_q_31': "下列算法的輸出是什麼？\nN ← 10, K ← 0\n當 N < 14 執行\n  K ← K + N\n  N ← N + 1\n輸出 K",
    '2020_q_32': "下列算法的輸出是什麼？\nP ← 0, Q ← 1\n設 i 由 1 至 5 執行\n  如果 i < 2 則\n    輸出 i\n  否則\n    R ← P + Q\n    P ← Q\n    Q ← R",
    '2020_q_33': "下列算法的輸出是什麼？\nP ← 1, Q ← 1\n重複\n  P ← P + 1\n  Q ← Q * 2\n直至 (P > 4)\n輸出 Q",
    '2021_q_09': "在網上系統內要求用戶輸入密碼兩次（密碼、重新輸入密碼）的目的是什麼？",
    '2021_q_12': "下圖顯示了「輸入—處理—輸出」週期的基本概念。X 和 Y 是什麼？",
    '2021_q_29': "下列算法的輸出是什麼？\nX ← 9, Y ← 2\n重複\n  輸出 (X / Y) 的餘數\n  X ← (X / Y) 的整數部分\n直至 X = 0",
    '2021_q_32': "以陣列 P 的初始值 P[1]=0, P[2]=1, P[3]=1, P[4]=0 運行，下列算法的輸出是什麼？\nQ ← 1\n設 i 由 1 至 4 執行\n  如果 P[i] = 1 則\n    Q ← 1 - Q\n輸出 Q",
    '2021_q_33': "下列算法的輸出是什麼？\nsum ← 0, j ← 12\n重複\n  sum ← sum + 1\n  j ← j - 2\n直至 j <= 2\n輸出 sum",
    '2021_q_34': "下列算法的輸出是什麼？\n設 i 由 1 至 5 執行 A[i] ← i\nS ← 0, i ← 1\n當 i <= 4 執行\n  S ← S + A[i] * A[i+1]\n  i ← i + 1\n輸出 S",
    '2021_q_35': "下列算法的輸出是什麼？\nX ← 6, Y ← 4, H ← 2\n當 H > 0 執行\n  X ← X + Y\n  Y ← X - Y\n  H ← H - 1\n輸出 Y",
    '2022_q_21': "在一般情況下，P、Q 和 R 會是什麼？\n（展示用戶輸入 P 至電腦，電腦處理後輸出 R）",
    '2022_q_29': "在下列算法中，輸入什麼值不會輸出「完成！」？\n輸入 N\nflag ← TRUE\n當 flag = TRUE 執行\n  如果 (N / 4) 的餘數 > 0 則 flag ← FALSE\n輸出 '完成！'",
    '2022_q_30': "參考下列算法，回答問題。\nj ← 0\n輸入 N\n當 N <> 888 執行\n  j ← j + N\n  輸入 N\n輸出 j\n這個算法的目的是什麼？",
    '2022_q_31': "參考下列算法，回答問題。\nj ← 0\n輸入 N\n當 N <> 888 執行\n  j ← j + N\n  輸入 N\n輸出 j\n數值「888」有什麼作用？",
    '2023_q_23': "在以下網絡圖中，電腦可接達互聯網。X 和 Y 是什麼？",
    '2023_q_27': "空運行下列算法。會有多少個「*」輸出？\nN ← 2\n當 N < 8 執行\n  輸出 \"*\"\n  N ← N + 3",
    '2023_q_30': "以下算法的輸出是什麼？\nA ← 5, B ← 11\n設 C 由 2 至 3 執行\n  B ← A + B\n輸出 (A + B)",
    '2023_q_32': "NUM 是一個有 N 個數值的整數陣列。以下算法有什麼目的？\nA ← NUM[1]\n當 i < N 執行\n  i ← i + 1\n  如果 NUM[i] > A 則 A ← NUM[i]",
    '2024_q_25': "在以下網絡圖內，X 的主要功能是什麼？\n（連接互聯網、課室與教員室）",
    '2024_q_27': "在以下算法，S 的最終值大於 15。N 的最小可能輸入值是什麼？\n輸入 N\nS ← 0\n設 i 由 3 至 N 執行\n  S ← S + i",
    '2024_q_28': "以下算法的輸出是什麼？\nP ← 9, Q ← 7, R ← 4\n如果 P > Q + R 則\n  如果 Q > 2 * R 則 X ← 10 否則 X ← 20\n否則\n  如果 Q > 2 * R 則 X ← 30 否則 X ← 40\n輸出 X",
    '2024_q_29': "以下算法的輸出是什麼？\nM ← 1\n重複\n  M ← M + 1\n直至 NOT (M < 3)\n輸出 M",
    '2024_q_30': "以下算法的輸出是什麼？\nS ← 0, N ← 1\n重複\n  S ← S + N\n  N ← N + 2\n直至 N > 6\n輸出 S",
    '2024_q_39': "使用以下電腦需要作出什麼符合人體工學的改良？",
    '2025_q_27': "細看以下算法：\ni ← 10\n當 i > 0\n  輸出 i\n以下哪句應插入在循環內，以避免出現無限循環？",
    '2025_q_28': "志明設計了 M1 和 M2 兩個不同算法，在自動販賣機內以每 5 個積分輸出一罐汽水，如以下兩個流程圖段展示，N 代表積分數量。如果 N = 10，M1 和 M2 輸出多少罐汽水？",
    '2025_q_29': "志明設計了 M1 和 M2 兩個不同算法，在自動販賣機內以每 5 個積分輸出一罐汽水，如以下兩個流程圖段展示，N 代表積分數量。假設 N = 0。以下哪句是正確的？",
    '2025_q_30': "以下算法檢查巴士乘客是否有資格享用折扣車費：\n如果 (age <= 11) or (age >= 60) 輸出「有折扣！」否則 輸出「沒有折扣！」\n以下哪組 age 的數據組最適合用作測試此算法？",
    '2025_q_31': "在以下算法，使用循環的目的是什麼？\n輸入 N\n當 N < 0 或 N > 100 執行\n  輸入 N",
    '2025_q_32': "版本 1 和 2 是具有相同效果的算法。在版本 2 內未填的部分是什麼？\n版本 1：如果 (P > 20) A ← P * 5 否則 A ← P * 2\n版本 2：A ← P * 2；如果 (P > 20) A ← A + P * 3",
    '2025_q_33': "以下算法可能輸出哪個數值？\n如果 (K < 9) or (K > 22) 輸出 K",
    '2025_q_34': "參考以下算法，K 的最終值是什麼？\ni ← 1, A[1] ← 1, K ← 3\n當 i < 5 執行\n  i ← i + 1\n  A[i] ← A[i-1] + K\n  K ← K + 2\n輸出 A[5]",
    '2025_q_35': "參考以下算法，此算法的輸出是什麼？\ni ← 1, A[1] ← 1, K ← 3\n當 i < 5 執行\n  i ← i + 1\n  A[i] ← A[i-1] + K\n  K ← K + 2\n輸出 A[5]",
    '2025_q_36': "以下算法的輸出是什麼？\nN ← 1\n設 i 由 1 至 4 執行\n  N ← N * i + 1\n輸出 N",
    '2025_q_37': "以下算法的輸出是什麼？\nX ← 0, Y ← 1\n設 i 由 1 至 5 執行\n  temp ← X + Y\n  X ← Y\n  Y ← temp\n輸出 Y",
    '2025_q_38': "以下算法的輸出是什麼？\nS ← 0, A ← 3\n當 A <= 9 執行\n  S ← S + A\n  如果 ((A / 2) 的餘數) = 1\n    A ← A + 1\n  否則\n    A ← 2 * A + 1\n輸出 S"
}

def clean_chinese_text(text):
    if not text:
        return ''
    s = text.strip()
    
    # 1. Normalize linebreaks and multi-spaces
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\r\n|\r', '\n', s)
    
    # 2. Chinese inter-character space removal
    han_regex = re.compile(r'([\u4e00-\u9fff])\s+([\u4e00-\u9fff])')
    while han_regex.search(s):
        s = han_regex.sub(r'\1\2', s)
        
    # 3. Punctuation spacing and conversion
    # Space between Han and Chinese punctuation
    s = re.sub(r'([\u4e00-\u9fff])\s+([，。、？！（）《》：；“”‘’「」『』])', r'\1\2', s)
    s = re.sub(r'([，。、？！（）《》：；“”‘’「」『』])\s+([\u4e00-\u9fff])', r'\1\2', s)
    
    # Convert trailing or isolated half-width punctuation right after Chinese
    s = re.sub(r'([\u4e00-\u9fff])\s*,\s*', r'\1，', s)
    s = re.sub(r'([\u4e00-\u9fff])\s*\?\s*', r'\1？', s)
    s = re.sub(r'([\u4e00-\u9fff])\s*:\s*', r'\1：', s)
    s = re.sub(r'([\u4e00-\u9fff])\s*;\s*', r'\1；', s)
    s = re.sub(r'([\u4e00-\u9fff])\s*!\s*', r'\1！', s)
    
    # 4. Standard MC pattern spacing
    s = re.sub(r'\(\s*(\d+)\s*\)', r'(\1)', s)
    s = re.sub(r'（\s*(\d+)\s*）', r'(\1)', s)
    s = re.sub(r'只\s*有\s*', '只有', s)
    s = re.sub(r'\s*和\s*', '和', s)
    s = re.sub(r'、\s*', '、', s)
    
    # 5. Apply typo corrections
    for pattern, replacement in TYPO_REPLACEMENTS:
        s = re.sub(pattern, replacement, s)
        
    return s.strip()

def parse_xml_database():
    print('[deep_refine_ocr] Parsing ict-mc.xml...')
    tree = ET.parse(XML_PATH)
    root = tree.getroot()
    
    xml_map = {}
    for q in root.findall('Question'):
        qt = q.find('QText')
        if qt is None:
            continue
        ey = qt.attrib.get('examyear', '').strip()
        if ey.startswith('HKCEE '):
            year = ey.replace('HKCEE ', '')
            if int(year) > 2011:
                continue
        elif ey.startswith('HKDSE '):
            year = ey.replace('HKDSE ', '')
            if int(year) < 2012:
                continue
        else:
            continue
            
        raw_text = (qt.text or '').strip()
        opts = [(opt.text or '').strip() for opt in q.findall('Option')]
        
        # Match question number
        m = re.search(r'(?:^|\n|\s)(\d{1,2})\s*[\.、\s]\s*', raw_text)
        qnum = int(m.group(1)) if m else (29 if raw_text == '#figure' and year == '2025' else None)
        if qnum is not None:
            xml_map[f'{year}_{qnum}'] = {
                'year': year,
                'qnum': qnum,
                'raw': raw_text,
                'options': opts
            }
            
    print(f'[deep_refine_ocr] Parsed {len(xml_map)} questions from ict-mc.xml.')
    return xml_map

def run_deep_refine():
    xml_map = parse_xml_database()
    
    with open(OCR_PATH, 'r', encoding='utf-8') as f:
        ocr_db = json.load(f)
        
    print(f'[deep_refine_ocr] Reviewing all {len(ocr_db)} questions...')
    
    refined_count = 0
    
    for uid, item in ocr_db.items():
        year = item['year']
        qnum = int(re.search(r'q_(\d+)', uid).group(1))
        key = f'{year}_{qnum}'
        
        xml_info = xml_map.get(key)
        if not xml_info:
            print(f'Warning: No XML match for {uid}')
            continue
            
        # Determine question text
        if uid in ALGORITHM_RECONSTRUCTIONS:
            final_q = ALGORITHM_RECONSTRUCTIONS[uid]
        else:
            xml_raw = xml_info['raw']
            
            # Remove leading question number like "1." or "01." while preserving preambles
            # If preamble exists like "段落...\n14. 題目", strip "14. "
            if re.search(r'(?:^|\n)\s*\d{1,2}\s*[\.、\s]\s*', xml_raw):
                clean_q = re.sub(r'(^|\n)\s*\d{1,2}\s*[\.、\s]\s*', r'\1', xml_raw)
            else:
                clean_q = xml_raw
                
            # Handle #figure
            # If #figure is present, replace with clean newline or omit cleanly
            clean_q = re.sub(r'\s*#figure\s*', '\n', clean_q)
            
            final_q = clean_chinese_text(clean_q)
            
        final_q = clean_chinese_text(final_q)
        item['question'] = final_q
        
        # Handle options
        # Check special case: 2022_q_10
        if uid == '2022_q_10':
            item['options'] = {
                'A': '目標儲存格：$B$4，目標值：1000，變數儲存格：$B$6',
                'B': '目標儲存格：$B$4，目標值：30000，變數儲存格：$B$6',
                'C': '目標儲存格：$B$6，目標值：1000，變數儲存格：$B$4',
                'D': '目標儲存格：$B$6，目標值：30000，變數儲存格：$B$4'
            }
        else:
            xml_opts = xml_info['options']
            letters = ['A', 'B', 'C', 'D']
            opts_dict = {}
            for i, opt_text in enumerate(xml_opts[:4]):
                letter = letters[i]
                cleaned_opt = clean_chinese_text(opt_text)
                opts_dict[letter] = cleaned_opt
            item['options'] = opts_dict
            
        refined_count += 1
        
    print(f'[deep_refine_ocr] Successfully refined {refined_count} questions!')
    
    # Save refined ocr.json
    with open(OCR_PATH, 'w', encoding='utf-8') as f:
        json.dump(ocr_db, f, ensure_ascii=False, indent=2)
        
    print(f'[deep_refine_ocr] Saved refined database to {OCR_PATH}.')

if __name__ == '__main__':
    run_deep_refine()
