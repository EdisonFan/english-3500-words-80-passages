# -*- coding: utf-8 -*-
"""测试PDF导出（单篇），使用绝对路径避免工作目录问题。"""
import pathlib
from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:8080"
PROJECT_DIR = pathlib.Path(__file__).parent
OUT_DIR = PROJECT_DIR / "pdf_test"
OUT_DIR.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    url = f"{BASE_URL}/#/1"
    print(f"访问: {url}")
    page.goto(url, wait_until="networkidle", timeout=20000)
    page.wait_for_selector(".card", timeout=15000)
    page.wait_for_timeout(500)
    out_path = OUT_DIR / "Passage_01.pdf"
    page.pdf(
        path=str(out_path),
        format="A4",
        print_background=True,
        prefer_css_page_size=True,
    )
    print(f"OK -> {out_path}")
    browser.close()
