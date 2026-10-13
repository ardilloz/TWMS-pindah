"""Tanda Terima Barang (receipt) PDF for a single transaction, with Pengirim / Penerima signature boxes."""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A5, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from lib.dates import fmt_ddmmyy, fmt_hhmmss
from lib.stock import ITEM_LABELS

TYPE_LABELS = {"masuk": "Barang Masuk", "transfer": "Transfer Gudang", "pribadi": "Penggunaan Pribadi"}
FROM_LABEL = {"masuk": "Supplier (Pengirim)", "transfer": "Gudang Asal", "pribadi": "Gudang"}
TO_LABEL = {"masuk": "Gudang Penerima", "transfer": "Gudang Tujuan", "pribadi": "Penerima / Keperluan"}
BROWN = colors.HexColor("#3D2411")
LINE = colors.HexColor("#C9B9A3")


def receipt_number(t: dict) -> str:
    """Format: TT{yy}{seq:03d}{HHMMSS} — contoh: TT26001150320."""
    date = t.get("date") or ""
    yy = date[2:4] if len(date) >= 4 else "00"
    seq = int(t.get("receipt_seq") or 0)
    return f"TT{yy}{seq:03d}{fmt_hhmmss(t.get('created_at'))}"


def receipt_parties(t: dict) -> tuple[str, str]:
    """(pengirim, penerima) for the transaction type."""
    if t["type"] == "masuk":
        return t.get("supplier_name") or "-", t["warehouse_name"]
    if t["type"] == "transfer":
        return t["warehouse_name"], t.get("target_warehouse_name") or "-"
    return t["warehouse_name"], t.get("note") or "-"


def _styles() -> dict[str, ParagraphStyle]:
    ss = getSampleStyleSheet()
    cell = ParagraphStyle("c", parent=ss["Normal"], fontSize=9.5, leading=12)
    small = ParagraphStyle("s", parent=ss["Normal"], fontSize=8.5, textColor=colors.HexColor("#57534E"))
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], fontSize=16, textColor=BROWN, spaceAfter=0, alignment=0),
        "small": small,
        "small_center": ParagraphStyle("sc", parent=small, alignment=1),
        "cell": cell,
        "cellb": ParagraphStyle("cb", parent=cell, fontName="Helvetica-Bold"),
        "center": ParagraphStyle("ctr", parent=cell, alignment=1),
    }


def _info_table(t: dict, st: dict, pengirim: str, penerima: str) -> Table:
    rows = [
        ["No. Tanda Terima", receipt_number(t), "Tanggal", fmt_ddmmyy(t["date"])],
        ["Jenis Transaksi", TYPE_LABELS[t["type"]], "Dicatat oleh", t.get("created_by_name", "")],
        [FROM_LABEL[t["type"]], pengirim, TO_LABEL[t["type"]], penerima],
        ["Nama Driver", t.get("driver_name") or "-", "No. Kendaraan", t.get("vehicle_number") or "-"],
    ]
    data = [[Paragraph(a, st["cellb"]), Paragraph(str(b), st["cell"]), Paragraph(c, st["cellb"]), Paragraph(str(d), st["cell"])] for a, b, c, d in rows]
    tbl = Table(data, colWidths=[34 * mm, 58 * mm, 34 * mm, 58 * mm])
    tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return tbl


def _item_table(t: dict, st: dict, qty_text: str, input_text: str) -> Table:
    cell = st["cell"]
    header = [Paragraph(f"<b>{h}</b>", cell) for h in ("No", "Nama Barang", "Jumlah Input", "Jumlah", "Keterangan")]
    body = [Paragraph("1", cell), Paragraph(ITEM_LABELS[t["item"]], st["cellb"]), Paragraph(input_text, cell),
            Paragraph(qty_text, st["cellb"]), Paragraph(t.get("note") or "-", cell)]
    tbl = Table([header, body], colWidths=[10 * mm, 38 * mm, 32 * mm, 52 * mm, 52 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3ECE1")),
        ("GRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tbl


def _signature_table(st: dict, pengirim: str, penerima: str) -> Table:
    blank = "( ........................................ )"
    data = [
        [Paragraph("<b>Pengirim</b>", st["center"]), "", Paragraph("<b>Penerima</b>", st["center"])],
        ["", "", ""],
        [Paragraph(blank, st["center"]), "", Paragraph(blank, st["center"])],
        [Paragraph(pengirim, st["small_center"]), "", Paragraph(penerima, st["small_center"])],
    ]
    tbl = Table(data, colWidths=[70 * mm, 44 * mm, 70 * mm], rowHeights=[None, 20 * mm, None, None])
    tbl.setStyle(TableStyle([("BOX", (0, 0), (0, -1), 0.6, LINE), ("BOX", (2, 0), (2, -1), 0.6, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return tbl


def build_receipt_pdf(t: dict, qty_text: str, input_text: str) -> io.BytesIO:
    st = _styles()
    pengirim, penerima = receipt_parties(t)
    story = [Paragraph("TANDA TERIMA BARANG", st["title"])]
    if t.get("edited_by_name"):
        story.append(Paragraph(f"Direvisi oleh {t['edited_by_name']}", st["small"]))
    story += [
        Spacer(1, 4 * mm),
        _info_table(t, st, pengirim, penerima),
        Spacer(1, 3 * mm),
        _item_table(t, st, qty_text, input_text),
        Spacer(1, 6 * mm),
        _signature_table(st, pengirim, penerima),
    ]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A5), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=10 * mm, bottomMargin=10 * mm,
                            title=f"Tanda Terima {receipt_number(t)}")
    doc.build(story)
    buf.seek(0)
    return buf
