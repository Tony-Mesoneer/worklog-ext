#!/usr/bin/env python3
"""Sinh icon extension (16/32/48/128) vào public/icons/.

    python3 scripts/generate-icons.py

Thay cho bản cũ chụp màn hình Chromium headless. Lý do đổi: cách chụp màn hình
có hai lớp lỗi không nằm ở icon chút nào — Chromium cache cả `file://` theo URL
nên sửa template rồi render lại nhận về bản CŨ, và nó không tự thoát nên phải
dựa vào timeout, khiến một lần render thất bại trông giống hệt thành công. Vẽ
trực tiếp bằng Pillow thì không có lớp nào trong hai lớp đó.

Cần Pillow (`python3 -c "import PIL"`). Font lấy từ hệ thống, không kèm theo repo.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'icons'

# SF Pro là font variable, nên 'Heavy' là một trục của CHÍNH file này chứ không
# phải một file .ttf riêng — tương đương font-weight 800.
FONT_PATH = '/System/Library/Fonts/SFNS.ttf'
FONT_VARIATION = 'Heavy'

BG = (18, 18, 18, 255)
FG = (255, 255, 255, 255)

# 16 và 32 chỉ dùng "M.": "Meso." ở 16px là ~3px mỗi ký tự, thành vệt mờ.
# Dấu chấm là một phần của wordmark nên có ở mọi cỡ.
# (size, text, font_px, radius) — mỗi cỡ tinh chỉnh riêng, không scale từ một
# ảnh lớn xuống: chữ nhoè ngay.
SPECS = [
    (16, 'M.', 10, 3.5),
    (32, 'M.', 19, 7.0),
    (48, 'Meso.', 14, 10.5),
    (128, 'Meso.', 37, 28.0),
]

# Vẽ ở 4x rồi thu nhỏ bằng LANCZOS: bo góc và cạnh glyph ở 16px mà vẽ trực tiếp
# sẽ răng cưa.
SUPERSAMPLE = 4


def render(size: int, text: str, font_px: int, radius: float) -> None:
    w = size * SUPERSAMPLE
    img = Image.new('RGBA', (w, w), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, w - 1, w - 1], radius=radius * SUPERSAMPLE, fill=BG)

    font = ImageFont.truetype(FONT_PATH, font_px * SUPERSAMPLE)
    font.set_variation_by_name(FONT_VARIATION)
    # anchor='mm' căn theo tâm bounding box của glyph. Căn theo line height sẽ
    # lệch xuống: line height chừa chỗ cho dấu phụ mà "M." không dùng.
    draw.text((w / 2, w / 2), text, font=font, fill=FG, anchor='mm')

    out = OUT / f'icon{size}.png'
    img.resize((size, size), Image.LANCZOS).save(out)
    print(f'{out.name} — "{text}"')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        render(*spec)
    print('xong')


if __name__ == '__main__':
    main()
