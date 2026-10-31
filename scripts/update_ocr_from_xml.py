import xml.etree.ElementTree as ET
import json
import os
import re

ROOT_DIR = os.getcwd()
OCR_PATH = os.path.join(ROOT_DIR, 'data', 'ocr.json')
XML_PATH = os.path.join(ROOT_DIR, 'ict-mc.xml')

with open(OCR_PATH, 'r', encoding='utf-8') as f:
    ocr_data = json.load(f)

tree = ET.parse(XML_PATH)
root = tree.getroot()

xml_map = {}
for q in root.findall('Question'):
    qtext = q.find('QText')
    if qtext is None:
        continue
    ey = qtext.get('examyear')
    raw_text = qtext.text or ''
    m = re.match(r'^\s*(\d+)\.\s*(.*)', raw_text, re.DOTALL)
    if m:
        qnum = int(m.group(1))
        content = m.group(2).strip()
    else:
        qnum = None
        content = raw_text.strip()
    
    opts = {}
    for i, opt in enumerate(q.findall('Option')):
        letter = chr(65 + i)
        opts[letter] = (opt.text or '').strip()
    
    xml_map[f"{ey}_{qnum}"] = {
        'text': content,
        'options': opts,
        'figure': qtext.get('figure')
    }

def clean_sup_tags(text):
    if not text:
        return ''
    # Replace <sup>N</sup> with ^N
    return re.sub(r'<sup>([^<]+)</sup>', r'^\1', text)

def clean_chinese_spacing(text):
    if not text:
        return ''
    s = text
    # normalize newlines
    s = s.replace('\r\n', '\n').replace('\r', '\n')
    
    # collapse repeated spaces on a single line (except tabs)
    lines = s.split('\n')
    cleaned_lines = []
    for l in lines:
        cleaned = re.sub(r'[ ]{2,}', ' ', l).rstrip()
        cleaned_lines.append(cleaned)
    s = '\n'.join(cleaned_lines)
    
    # Remove spaces between Chinese characters
    han = r'[\u4e00-\u9fff\u3400-\u4dbf]'
    while re.search(f'({han}) +({han})', s):
        s = re.sub(f'({han}) +({han})', r'\1\2', s)
    
    # Remove spaces between Han character and Chinese punctuation
    punct = r'[，。、？！（）《》：；“”‘’]'
    s = re.sub(f'({han}) +({punct})', r'\1\2', s)
    s = re.sub(f'({punct}) +({han})', r'\1\2', s)
    
    # Normalize standard MC option patterns like "( 1 )" -> "(1)"
    s = re.sub(r'\(\s*(\d+)\s*\)', r'(\1)', s)
    
    return s.strip()

updated_questions = 0
updated_options = 0

for uid, item in ocr_data.items():
    year = item['year']
    m = re.search(r'q_0*(\d+)', uid)
    qnum = int(m.group(1))
    
    ey = f"hkdse-{year}" if int(year) >= 2012 else f"hkcee-{year}"
    xml_item = xml_map.get(f"{ey}_{qnum}")
    if not xml_item:
        continue
    
    ocr_q = item.get('question', '').strip()
    xml_q = clean_sup_tags(xml_item['text'].strip())
    
    # Clean <img> tags from XML question
    xml_q = re.sub(r'<img[^>]+>\s*', '', xml_q)
    
    # Check if we should update question text:
    # 1. Special cases where OCR has a valuable preamble missing in XML
    should_keep_ocr = False
    if uid == '2022_q_31':
        should_keep_ocr = True
    elif uid == '2025_q_29':
        should_keep_ocr = True
    
    if not should_keep_ocr:
        # Check if XML is richer or different
        clean_x = clean_chinese_spacing(xml_q)
        if clean_x and clean_x != ocr_q:
            # If XML has more content or better structure
            item['question'] = clean_x
            updated_questions += 1
    
    # Options update
    for l in ['A', 'B', 'C', 'D']:
        o_opt = item['options'].get(l, '').strip()
        x_opt = clean_sup_tags(xml_item['options'].get(l, '').strip())
        clean_xo = clean_chinese_spacing(x_opt)
        
        # If XML option has meaningful text
        if clean_xo:
            # If OCR option is empty or much shorter or has typos
            if not o_opt or len(clean_xo) > len(o_opt) or clean_xo != o_opt:
                if clean_xo != o_opt:
                    item['options'][l] = clean_xo
                    updated_options += 1

print(f"Updated {updated_questions} question texts and {updated_options} options in ocr.json")

with open(OCR_PATH, 'w', encoding='utf-8') as f:
    json.dump(ocr_data, f, ensure_ascii=False, indent=2)

print("Saved updated data/ocr.json successfully.")
