"""
scripts/refine_ocr.py
AI-driven OCR Deep Review and Correction for ICT MC Past Paper Database.
1. Re-OCRs all missing/empty option images using RapidOCR (PaddleOCR) with hybrid recognition.
2. Normalizes Chinese character spacing while preserving formulas and English terms.
3. Automatically fixes ICT terminology typos (e.g. 輸人 -> 輸入, CPIJ -> CPU).
4. Saves high-fidelity cleaned text to data/ocr.json.
"""

import json
import os
import re
import sys
import time
import cv2
from rapidocr_onnxruntime import RapidOCR

sys.stdout.reconfigure(encoding='utf-8')

OCR_FILE = os.path.join('data', 'ocr.json')

def clean_chinese_spacing(text):
    if not text:
        return ''
    s = text
    # Collapse multiple spaces
    s = re.sub(r'[ \t]+', ' ', s)

    # Remove spaces between Chinese characters
    # Repeat until no more spaces between Han characters
    han_regex = re.compile(r'([\u4e00-\u9fff])\s+([\u4e00-\u9fff])')
    while han_regex.search(s):
        s = han_regex.sub(r'\1\2', s)

    # Remove spaces between Han character and Chinese punctuation
    s = re.sub(r'([\u4e00-\u9fff])\s+([，。、？！（）《》：；“”‘’])', r'\1\2', s)
    s = re.sub(r'([，。、？！（）《》：；“”‘’])\s+([\u4e00-\u9fff])', r'\1\2', s)

    # Normalize standard MC option patterns like "只 有 ( 1 ) 和 ( 2 )" -> "只有(1)和(2)"
    s = re.sub(r'\(\s*(\d+)\s*\)', r'(\1)', s)
    s = re.sub(r'只\s*有\s*', r'只有', s)
    s = re.sub(r'\s*和\s*', r'和', s)
    s = re.sub(r'、\s*', r'、', s)

    return s.strip()

# Dictionary of high-frequency ICT exam typos from OCR scans
TYPO_CORRECTIONS = [
    (r'輸\s*人', '輸入'),
    (r'CPIJ', 'CPU'),
    (r'\bCPu\b', 'CPU'),
    (r'追璐球|追球', '軌跡球'),
    (r'互\s*聯\s*網', '互聯網'),
    (r'資\s*訊\s*系\s*統', '資訊系統'),
    (r'試\s*算\s*表', '試算表'),
    (r'數\s*據\s*庫', '數據庫'),
    (r'儲\s*存\s*裝\s*置', '儲存裝置'),
    (r'儲\s*存\s*格', '儲存格'),
    (r'操\s*作\s*系\s*統', '操作系統'),
    (r'二\s*進\s*制', '二進制'),
    (r'十\s*六\s*進\s*制', '十六進制'),
    (r'光\s*導\s*纖\s*維', '光導纖維'),
    (r'雙\s*扭\s*線', '雙扭線'),
    (r'同\s*軸\s*電\s*纜', '同軸電纜'),
    (r'防\s*火\s*牆', '防火牆'),
    (r'數\s*碼\s*簽\s*署', '數碼簽署'),
    (r'數\s*碼\s*水\s*印', '數碼水印'),
    (r'知\s*識\s*產\s*權', '知識產權'),
    (r'項\s*目\s*報\s*告', '項目報告'),
    (r'數\s*據\s*分\s*析', '數據分析'),
    (r'數\s*據\s*收\s*集', '數據收集'),
    (r'成\s*批\s*處\s*理', '成批處理'),
    (r'實\s*時\s*處\s*理', '實時處理'),
    (r'交\s*互\s*式\s*處\s*理', '交互式處理'),
    (r'分\s*布\s*式\s*處\s*理', '分布式處理'),
    (r'多\s*用\s*戶', '多用戶'),
    (r'微\s*型\s*控\s*制\s*器', '微型控制器'),
    (r'嵌\s*入\s*式\s*系\s*統', '嵌入式系統'),
    (r'電\s*腦\s*輔\s*助\s*教\s*學', '電腦輔助教學'),
    (r'人\s*工\s*智\s*能', '人工智能'),
    (r'條\s*碼\s*掃\s*描\s*器', '條碼掃描器'),
    (r'感\s*熱\s*式\s*打\s*印\s*機', '感熱式打印機'),
    (r'銷\s*售\s*點\s*終\s*端\s*機', '銷售點終端機'),
    (r'方\s*格\s*內\s*應\s*是\s*什\s*麼', '方格內應是什麼'),
]

def correct_ict_terms(text):
    if not text:
        return ''
    s = text
    for pattern, replacement in TYPO_CORRECTIONS:
        s = re.sub(pattern, replacement, s)
    return s

def run_refinement():
    print('[refine_ocr] Loading data/ocr.json...')
    with open(OCR_FILE, 'r', encoding='utf-8-sig') as f:
        ocr_db = json.load(f)

    # 1. Identify missing or empty option images
    missing_options = []
    for uid, item in ocr_db.items():
        yr = item['year']
        for opt_key, opt_text in item['options'].items():
            if not opt_text or not opt_text.strip():
                part = ord(opt_key) - 64
                img_path = f'Paper/{yr}/{uid}_{part}.png'
                if os.path.exists(img_path):
                    missing_options.append((uid, opt_key, img_path))

    print(f'[refine_ocr] Identified {len(missing_options)} empty options to recover with RapidOCR...')

    if missing_options:
        engine = RapidOCR()
        t0 = time.time()
        recovered_count = 0

        for idx, (uid, opt_key, img_path) in enumerate(missing_options):
            try:
                img = cv2.imread(img_path)
                if img is None:
                    continue
                res, _ = engine(img, use_det=False)
                txt = res[0][0].strip() if (res and res[0] and res[0][1] > 0.4) else ''

                if txt:
                    ocr_db[uid]['options'][opt_key] = txt
                    recovered_count += 1
            except Exception as e:
                pass

            if (idx + 1) % 50 == 0 or idx == len(missing_options) - 1:
                print(f'[refine_ocr] Re-OCR progress: {idx + 1}/{len(missing_options)} ({recovered_count} recovered)')

        print(f'[refine_ocr] Re-OCR complete in {time.time() - t0:.1f}s. Recovered {recovered_count} options.')

    # 2. NLP Spacing, Punctuation & Typo Correction pass
    print('[refine_ocr] Running Chinese spacing and typo correction across all questions...')
    corrected_q_count = 0
    corrected_opt_count = 0

    for uid, item in ocr_db.items():
        q_text = item.get('question', '')
        if q_text:
            cleaned_q = clean_chinese_spacing(q_text)
            cleaned_q = correct_ict_terms(cleaned_q)
            if cleaned_q != q_text:
                corrected_q_count += 1
                item['question'] = cleaned_q

        for opt_k, opt_v in item.get('options', {}).items():
            if opt_v:
                cleaned_opt = clean_chinese_spacing(opt_v)
                cleaned_opt = correct_ict_terms(cleaned_opt)
                if cleaned_opt != opt_v:
                    corrected_opt_count += 1
                    item['options'][opt_k] = cleaned_opt

    print(f'[refine_ocr] Spacing & typo corrections applied: {corrected_q_count} questions, {corrected_opt_count} options.')

    # 3. Save refined data/ocr.json
    with open(OCR_FILE, 'w', encoding='utf-8') as f:
        json.dump(ocr_db, f, ensure_ascii=False, indent=2)

    print('[refine_ocr] Saved refined text to data/ocr.json successfully!')

if __name__ == '__main__':
    run_refinement()
