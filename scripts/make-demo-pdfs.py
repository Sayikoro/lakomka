# -*- coding: utf-8 -*-
"""Демо-PDF для отладки флипбука: catalog_1, catalog_2, certificate.
Пользователь заменит их реальными печатными каталогами через админку."""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

OUT = "/home/z/my-project/public/uploads/pdfs"
os.makedirs(OUT, exist_ok=True)

PINK = (0.85, 0.28, 0.45)
CREAM = (1.0, 0.97, 0.92)
DARK = (0.25, 0.18, 0.2)


def make_pdf(path: str, title: str, subtitle: str, pages: int) -> None:
    w, h = A4
    c = canvas.Canvas(path, pagesize=A4)
    for p in range(1, pages + 1):
        # фон
        c.setFillColorRGB(*CREAM)
        c.rect(0, 0, w, h, fill=1, stroke=0)
        # декоративная рамка
        c.setStrokeColorRGB(*PINK)
        c.setLineWidth(2)
        c.roundRect(14 * mm, 14 * mm, w - 28 * mm, h - 28 * mm, 6 * mm, stroke=1, fill=0)
        # заголовок обложки
        c.setFillColorRGB(*DARK)
        c.setFont("DejaVu-Bold", 34)
        c.drawCentredString(w / 2, h / 2 + 30 * mm, title)
        c.setFont("DejaVu", 16)
        c.setFillColorRGB(*PINK)
        c.drawCentredString(w / 2, h / 2 + 14 * mm, subtitle)
        c.setFont("DejaVu", 13)
        c.setFillColorRGB(*DARK)
        if p == 1:
            c.drawCentredString(w / 2, h / 2 - 20 * mm, "Демонстрационный файл")
            c.drawCentredString(w / 2, h / 2 - 28 * mm, "Замените реальный каталог через админку: Раздел PDF")
        else:
            c.drawCentredString(w / 2, h / 2, f"Страница {p} из {pages}")
            c.setFont("DejaVu", 11)
            c.setFillColorRGB(0.45, 0.4, 0.42)
            c.drawCentredString(w / 2, h / 2 - 9 * mm, "Интернет-магазин сладких подарков «Лакомка» · Хабаровск")
        # колонтитул
        c.setFont("DejaVu", 9)
        c.setFillColorRGB(0.55, 0.5, 0.52)
        c.drawCentredString(w / 2, 20 * mm, "ООО Компания «Лакомка» · lakomka-shop · 2015–2026")
        c.showPage()
    c.save()
    print("ok", path)


make_pdf(f"{OUT}/catalog_1.pdf", "КАТАЛОГ №1", "Сладкие подарки · 2026", 10)
make_pdf(f"{OUT}/catalog_2.pdf", "КАТАЛОГ №2", "Новогодние наборы · 2026", 8)
make_pdf(f"{OUT}/certificate.pdf", "СЕРТИФИКАТ СООТВЕТСТВИЯ", "ТР ТС 021/2011 · демонстрация", 1)
