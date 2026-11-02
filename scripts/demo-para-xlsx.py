#!/usr/bin/env python3
"""Converte o JSON gerado por tests/demo-gerar.test.ts em duas planilhas: demo-loja.xlsx e demo-mestra.xlsx.
Uso: python3 scripts/demo-para-xlsx.py demo.json pasta-de-saida"""
import json, sys, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

dados = json.load(open(sys.argv[1]))
saida = sys.argv[2]
os.makedirs(saida, exist_ok=True)

def gravar(abas, destino):
    wb = Workbook()
    wb.remove(wb.active)
    for nome, linhas in abas.items():
        ws = wb.create_sheet(nome)
        for l in linhas:
            ws.append([str(c) for c in l])  # tudo texto, como o sistema grava
        for c in ws[1]:
            c.font = Font(bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor="0B6E7F")
        ws.freeze_panes = "A2"
        for i, col in enumerate(ws.columns, 1):
            ws.column_dimensions[get_column_letter(i)].width = min(40, max(10, max(len(str(c.value or "")) for c in col) + 2))
    wb.save(destino)

gravar(dados["loja"], os.path.join(saida, "demo-loja.xlsx"))
gravar(dados["mestra"], os.path.join(saida, "demo-mestra.xlsx"))
print("ok", dados["geradoEm"])
