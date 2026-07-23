#!/usr/bin/env python3
"""
PaddleOCR / EasyOCR captcha recognition helper for lngbzx.js.
Auto-detects available engine: EasyOCR > PaddleOCR > pytesseract.
Usage: python lngbzx_ocr.py <image_path> [mode]
  mode: full (default) - recognize full image
        segments <s1> <s2> <s3> <s4> - recognize 4 individual char segments
Outputs the 4-digit captcha code to stdout, or exits with non-zero on failure.
"""

import sys
import os
import re


# 类似于数字的容易被 OCR 误识别的英文字符映射表
CHAR_MAP = {
    'O': '0', 'o': '0', 'D': '0', 'Q': '0', 'C': '0', 'U': '0',
    'I': '1', 'l': '1', 'i': '1', '|': '1', '!': '1', 'J': '1',
    'Z': '2', 'z': '2',
    'E': '3',
    'A': '4', 'a': '4',
    'S': '5', 's': '5',
    'G': '6', 'b': '6',
    'T': '7', 't': '7',
    'B': '8', '&': '8',
    'g': '9', 'q': '9', 'P': '9', 'p': '9'
}


def _normalize_text(text):
    if not text:
        return ""
    normalized = []
    for ch in text:
        if ch.isdigit():
            normalized.append(ch)
        elif ch in CHAR_MAP:
            normalized.append(CHAR_MAP[ch])
        else:
            normalized.append(ch)
    return "".join(normalized)


def _extract_4digits(text):
    if not text:
        return None
    text_norm = _normalize_text(text)
    digits = ''.join(ch for ch in text_norm if ch.isdigit())
    if len(digits) == 4:
        return digits
    return None


# ── Engine: EasyOCR ──
def _easyocr_full(image_path):
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False)
    results = reader.readtext(image_path, detail=0)
    combined = ''.join(results)
    return _extract_4digits(combined)


def _easyocr_segments(segment_paths):
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False)
    digits = []
    for seg_path in segment_paths:
        if not os.path.exists(seg_path):
            digits.append('?')
            continue
        results = reader.readtext(seg_path, detail=0)
        text = _normalize_text(''.join(results))
        ch = ''.join(c for c in text if c.isdigit())
        digits.append(ch[0] if ch else '?')
    result = ''.join(digits)
    return result if len(result) == 4 and '?' not in result else None


# ── Engine: PaddleOCR ──

def _paddle_version():
    try:
        from paddleocr import __version__
        parts = __version__.split('.')
        return int(parts[0])
    except Exception:
        return 2


def _paddle_full(image_path):
    from paddleocr import PaddleOCR
    major = _paddle_version()
    if major >= 3:
        ocr = PaddleOCR(
            use_textline_orientation=False,
            lang='en',
            text_det_thresh=0.2,
            text_det_box_thresh=0.1,
        )
    else:
        ocr = PaddleOCR(
            use_angle_cls=False,
            lang='en',
            det_db_thresh=0.2,
            det_db_box_thresh=0.1,
            drop_score=0.1,
            use_gpu=False,
            show_log=False,
        )
    result = ocr.ocr(image_path, cls=False)
    if not result or not result[0]:
        return None
    texts = [line[1][0] for line in result[0]]
    return _extract_4digits(''.join(texts))


def _paddle_segments(segment_paths):
    from paddleocr import PaddleOCR
    major = _paddle_version()
    if major >= 3:
        ocr = PaddleOCR(
            use_textline_orientation=False,
            lang='en',
        )
    else:
        ocr = PaddleOCR(
            use_angle_cls=False,
            lang='en',
            det=False,
            rec=True,
            use_gpu=False,
            show_log=False,
        )
    digits = []
    for seg_path in segment_paths:
        if not os.path.exists(seg_path):
            digits.append('?')
            continue
        result = ocr.ocr(seg_path, det=False, cls=False)
        if result and result[0]:
            text = _normalize_text(result[0][0][0])
            ch = ''.join(c for c in text if c.isdigit())
            digits.append(ch[0] if ch else '?')
        else:
            digits.append('?')
    result = ''.join(digits)
    return result if len(result) == 4 and '?' not in result else None


# ── Engine: pytesseract (fallback) ──
def _tess_full(image_path):
    import pytesseract
    from PIL import Image
    configs = [
        '--psm 8 -c tessedit_char_whitelist=0123456789',
        '--psm 7 -c tessedit_char_whitelist=0123456789',
        '--psm 6 -c tessedit_char_whitelist=0123456789',
    ]
    for cfg in configs:
        try:
            img = Image.open(image_path)
            text = pytesseract.image_to_string(img, config=cfg)
            digits = ''.join(ch for ch in text if ch.isdigit())
            print(f'[pytesseract] cfg={cfg} raw={text!r} digits={digits!r}', file=sys.stderr)
            result = _extract_4digits(text)
            if result:
                return result
        except Exception as e:
            print(f'[pytesseract] cfg={cfg} error: {e}', file=sys.stderr)
    return None


def _tess_segments(segment_paths):
    import pytesseract
    from PIL import Image
    digits = []
    for seg_path in segment_paths:
        if not os.path.exists(seg_path):
            digits.append('?')
            continue
        try:
            img = Image.open(seg_path)
            text = pytesseract.image_to_string(
                img,
                config='--psm 10'
            )
            text = _normalize_text(text)
            ch = ''.join(c for c in text if c.isdigit())
            digits.append(ch[0] if ch else '?')
        except Exception:
            digits.append('?')
    result = ''.join(digits)
    return result if len(result) == 4 and '?' not in result else None


# ── Engine: ddddocr (Primary) ──
def _ddddocr_full(image_path):
    import ddddocr
    ocr = ddddocr.DdddOcr(show_ad=False)
    with open(image_path, 'rb') as f:
        img_bytes = f.read()
    res = ocr.classification(img_bytes)
    return _extract_4digits(res)


def _ddddocr_segments(segment_paths):
    import ddddocr
    ocr = ddddocr.DdddOcr(show_ad=False)
    digits = []
    for seg_path in segment_paths:
        if not os.path.exists(seg_path):
            digits.append('?')
            continue
        with open(seg_path, 'rb') as f:
            img_bytes = f.read()
        res = ocr.classification(img_bytes)
        text = _normalize_text(res)
        ch = ''.join(c for c in text if c.isdigit())
        digits.append(ch[0] if ch else '?')
    result = ''.join(digits)
    return result if len(result) == 4 and '?' not in result else None


def _detect_engine():
    engines = []
    try:
        import ddddocr
        engines.append(('ddddocr', _ddddocr_full, _ddddocr_segments))
    except ImportError:
        pass
    try:
        import easyocr
        engines.append(('easyocr', _easyocr_full, _easyocr_segments))
    except ImportError:
        pass
    try:
        import pytesseract
        engines.append(('pytesseract', _tess_full, _tess_segments))
    except ImportError:
        pass
    try:
        from paddleocr import PaddleOCR
        import paddle
        engines.append(('paddleocr', _paddle_full, _paddle_segments))
    except ImportError:
        pass
    return engines


def main():
    if len(sys.argv) < 2:
        print('[lngbzx_ocr.py] Usage: python lngbzx_ocr.py <image_path> [segments s1 s2 s3 s4]',
              file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(f'[lngbzx_ocr.py] Image not found: {image_path}', file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[2] if len(sys.argv) > 2 else 'full'

    engines = _detect_engine()
    if not engines:
        print('[lngbzx_ocr.py] No OCR engine available. Install one of: '
              'pytesseract, paddleocr, easyocr', file=sys.stderr)
        sys.exit(1)

    for name, fn_full, fn_seg in engines:
        try:
            if mode == 'full':
                result = fn_full(image_path)
            elif mode == 'segments' and len(sys.argv) >= 7:
                segment_paths = sys.argv[3:7]
                result = fn_seg(segment_paths)
            else:
                print(f'[lngbzx_ocr.py] Usage: ... <image_path> [segments s1 s2 s3 s4]',
                      file=sys.stderr)
                sys.exit(1)

            if result and re.match(r'^\d{4}$', result):
                print(f'[{name}] {result}', file=sys.stderr)
                print(result)
                sys.exit(0)
        except Exception as e:
            print(f'[{name}] Error: {e}', file=sys.stderr)

    sys.exit(1)


if __name__ == '__main__':
    main()
