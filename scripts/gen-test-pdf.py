#!/usr/bin/env python3
"""Генерация тестового PDF-каталога на 8 страниц (обложка + развороты)."""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

W, H = A4
OUT = "/home/z/my-project/scripts/test-catalog.pdf"

c = canvas.Canvas(OUT, pagesize=A4)
palette = [(0.93, 0.55, 0.62), (0.98, 0.83, 0.35), (0.42, 0.65, 0.85), (0.55, 0.78, 0.55)]

for p in range(1, 9):
    r, g, b = palette[(p - 1) % 4]
    c.setFillColorRGB(r, g, b)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 44)
    c.drawCentredString(W / 2, H / 2 + 30, f"LAKOMKA")
    c.setFont("Helvetica", 30)
    c.drawCentredString(W / 2, H / 2 - 20, f"Catalog test page {p} / 8")
    c.setFont("Helvetica", 16)
    c.drawCentredString(W / 2, 60, "Сладкие подарки — тестовый документ для проверки флипбука")
    c.showPage()

c.save()
print("OK:", OUT)
