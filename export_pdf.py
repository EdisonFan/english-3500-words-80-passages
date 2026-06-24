# -*- coding: utf-8 -*-
"""将SPA每篇Passage导出为PDF。

用法:
  python export_pdf.py          # 导出全部80篇
  python export_pdf.py 1        # 只导出第1篇（测试）
  python export_pdf.py 1 5      # 导出第1~5篇
"""
import sys
import pathlib
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:8080"
OUT_DIR = pathlib.Path(__file__).parent / "pdf"
OUT_DIR.mkdir(exist_ok=True)

if len(sys.argv) >= 3:
    start, end = int(sys.argv[1]), int(sys.argv[2])
elif len(sys.argv) == 2:
    start, end = int(sys.argv[1]), int(sys.argv[1])
else:
    start, end = 1, 80

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    for i in range(start, end + 1):
        url = f"{BASE_URL}/#/{i}"
        fname = f"Passage_{i:02d}.pdf"
        print(f"[{i:02d}/{end:02d}] {fname} ...", end=" ", flush=True)
        try:
            page.goto(url, wait_until="networkidle", timeout=20000)
            page.wait_for_selector(".card", timeout=15000)
            page.wait_for_timeout(300)
            page.pdf(
                path=str(OUT_DIR / fname),
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
            )
            print("OK")
        except Exception as e:
            print(f"FAIL: {e}")

    browser.close()

print(f"\n完成！PDF 保存在: {OUT_DIR}")
