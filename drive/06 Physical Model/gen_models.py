"""Generate draw.io files for the Halifax Twin logical and physical models.

Logical: parsed from the erwin reverse-engineering script (Halifax_Twin_Logical_V1_RE.sql).
Physical: parsed from a JSON dump of the live halifax_twin catalog (phys.json).
Usage: python gen_models.py <logical.sql> <phys.json> <out_logical.drawio> <out_physical.drawio>
"""
import json
import re
import sys
from xml.sax.saxutils import escape

FONT = "Helvetica"

# ---------- styling, matching the Conceptual Model V1 colours ----------
STEREO = {
    "Event":       ("#ffe6cc", "#d79b00"),
    "Asset":       ("#d5e8d4", "#82b366"),
    "Location":    ("#dae8fc", "#6c8ebf"),
    "Party":       ("#e1d5e7", "#9673a6"),
    "Reference":   ("#f5f5f5", "#666666"),
    "Associative": ("#ffffff", "#999999"),
    "Supertype":   ("#fff2cc", "#333333"),
}
AREA = {
    "CORE":                   ("#e0e0e0", "#fafafa", "CORE  ·  conformed entities shared by every sector"),
    "TRANSPORTATION":         ("#cce5ff", "#f5faff", "TRANSPORTATION"),
    "PUBLIC WORKS":           ("#d5f0e3", "#f5fcf8", "PUBLIC WORKS"),
    "HOUSING & REAL ESTATE":  ("#eadcf2", "#fbf7fd", "HOUSING & REAL ESTATE"),
}
SUPERTYPES = {"Location", "Party", "Asset", "Event"}
REFERENCE = {"Sector", "Subsector", "Source", "Calendar Date", "Measure"}
ASSOCIATIVE = {"Location Containment", "Party Sector Classification", "Party Asset Role",
               "Event Asset Involvement", "Event Party Involvement", "Event Coverage",
               "Route Segment Sequence", "Route Segment Street Segment"}

# columns of entities per subject area, placed left to right
LAYOUT = {
    "CORE": [
        ["Sector", "Subsector", "Source", "Calendar Date", "Measure"],
        ["Party", "Organization", "Party Sector Classification", "Party Asset Role"],
        ["Location", "Location Containment", "Area", "Parcel"],
        ["Street", "Street Segment", "Intersection", "Civic Address"],
        ["Asset", "Event Asset Involvement"],
        ["Event", "Event Party Involvement", "Event Coverage"],
        ["Weather Observation", "Area Statistic", "Economic Indicator"],
    ],
    "TRANSPORTATION": [
        ["Schedule Version", "Service Calendar", "Service Calendar Exception"],
        ["Route", "Route Segment Sequence", "Route Segment", "Route Segment Street Segment"],
        ["Scheduled Trip", "Scheduled Stop Time", "Stop"],
        ["Trip", "Stop Arrival", "Vehicle", "Vehicle Position"],
        ["Service Alert", "Collision", "Traffic Count"],
    ],
    "PUBLIC WORKS": [
        ["Service Request", "Work Order", "Capital Project", "Infrastructure Asset"],
        ["Road Closure", "Snow Clearing", "Pavement Condition Assessment", "Water Quality Reading"],
        ["Facility", "Waste Collection", "Waste Tonnage Record", "Utility Outage", "Public Advisory"],
    ],
    "HOUSING & REAL ESTATE": [
        ["Development Project", "Building Permit", "Building", "Dwelling Unit"],
        ["Short-Term Rental Registration", "Property Sale", "Property Assessment", "Rental Market Observation"],
    ],
}

W = 230          # entity width
ROW = 20         # attribute row height
HEAD = 44        # entity header height
COLGAP = 46
ROWGAP = 30
PAD = 24
AREA_HEAD = 34


def phys_name(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


# ---------- parse logical SQL ----------
def parse_logical(path):
    sql = open(path, encoding="utf-8").read()
    ents, order = {}, []
    for m in re.finditer(r"/\*\s*(\w[\w ]*?):\s*(.*?)\*/\s*CREATE TABLE \[([^\]]+)\] \((.*?)\n\);", sql, re.S):
        _, desc, name, body = m.groups()
        cols, pk = [], []
        for line in body.splitlines():
            cm = re.match(r"\s*\[([^\]]+)\]\s+(\S+)\s+(NOT NULL|NULL),?\s*(?:--\s*domain:\s*(.*))?", line)
            if cm:
                cols.append({"col": cm.group(1), "nn": cm.group(3) == "NOT NULL", "domain": (cm.group(4) or "").strip()})
            pm = re.search(r"PRIMARY KEY \((.*?)\)", line)
            if pm:
                pk = re.findall(r"\[([^\]]+)\]", pm.group(1))
        ents[name] = {"name": name, "desc": desc.strip(), "cols": cols, "pk": pk}
        order.append(name)
    fks = []
    for m in re.finditer(r"/\* (.*?) \*/\s*ALTER TABLE \[([^\]]+)\] ADD CONSTRAINT \[[^\]]+\] FOREIGN KEY \(([^)]*)\)\s*REFERENCES \[([^\]]+)\]", sql):
        phrase, child, cols, parent = m.groups()
        fks.append({"child": child, "parent": parent, "cols": re.findall(r"\[([^\]]+)\]", cols),
                    "phrase": phrase, "subtype": f"{parent} is a " in phrase})
    return ents, order, fks


def stereotype(name, supertype_of):
    if name in SUPERTYPES:
        return "Supertype"
    if name in supertype_of:
        return supertype_of[name]
    if name in REFERENCE:
        return "Reference"
    if name in ASSOCIATIVE:
        return "Associative"
    return "Reference"


# ---------- XML builder ----------
class Doc:
    def __init__(self):
        self.pages = []

    def page(self, pid, name, w, h):
        p = {"id": pid, "name": name, "w": w, "h": h, "cells": [], "under": []}
        self.pages.append(p)
        return p

    def xml(self):
        out = ['<mxfile host="app.diagrams.net" type="device">']
        for p in self.pages:
            out.append(f'  <diagram id="{p["id"]}" name="{escape(p["name"])}">')
            out.append(f'    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{p["w"]}" pageHeight="{p["h"]}" math="0" shadow="0">')
            out.append('      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>')
            out.extend("        " + c for c in p["under"] + p["cells"])
            out.append("      </root>\n    </mxGraphModel>\n  </diagram>")
        out.append("</mxfile>")
        return "\n".join(out)


def attr(v):
    return escape(v, {'"': "&quot;"})


def vertex(page, cid, parent, value, style, x, y, w, h, layer="cells"):
    page[layer].append(
        f'<mxCell id="{cid}" value="{attr(value)}" style="{attr(style)}" vertex="1" parent="{parent}">'
        f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')


def edge(page, cid, src, tgt, value, style, points=None):
    pts = ""
    if points:
        pts = '<Array as="points">' + "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in points) + "</Array>"
    page["under"].append(
        f'<mxCell id="{cid}" value="{attr(value)}" style="{attr(style)}" edge="1" parent="1" source="{src}" target="{tgt}">'
        f'<mxGeometry relative="1" as="geometry">{pts}</mxGeometry></mxCell>')


def lane(page, lid, label, fill, sfill, stroke, x, y, w, h):
    """Tinted background drawn under the edges, plus a transparent container on top for the tables."""
    vertex(page, lid + "_bg", "1", "", f"rounded=1;arcSize=1;fillColor={sfill};strokeColor=none;", x, y, w, h, layer="under")
    vertex(page, lid, "1", label,
           f"swimlane;startSize={AREA_HEAD};html=1;fontSize=15;fontStyle=1;rounded=1;arcSize=1;fillColor={fill};"
           f"swimlaneFillColor=none;strokeColor={stroke};container=1;collapsible=0;fontFamily={FONT};", x, y, w, h)


def entity(page, cid, parent, x, y, title, stereo, rows, width=W):
    """rows: list of (key_tag, text, is_pk) or None for a separator."""
    fill, stroke = STEREO[stereo]
    h = HEAD + sum(8 if r is None else ROW for r in rows) + 6
    tag = f'<font style="font-size:10px" color="#666666">«{stereo}»</font><br>'
    style = (f"swimlane;childLayout=stackLayout;horizontal=1;startSize={HEAD};horizontalStack=0;resizeParent=1;"
             f"resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;whiteSpace=wrap;rounded=1;arcSize=4;"
             f"fontFamily={FONT};fontSize=12;fillColor={fill};strokeColor={stroke};swimlaneFillColor=#ffffff;"
             + ("strokeWidth=2;" if stereo == "Supertype" else ""))
    vertex(page, cid, parent, f"{tag}<b>{escape(title)}</b>", style, x, y, width, h)
    yy = HEAD
    for i, r in enumerate(rows):
        if r is None:
            vertex(page, f"{cid}_s{i}", cid, "", f"line;strokeWidth=1;fillColor=none;strokeColor={stroke};points=[];", 0, yy, width, 8)
            yy += 8
            continue
        key, text, is_pk = r
        k = f'<font color="#999999" style="font-size:9px">{key}</font>&nbsp;&nbsp;' if key else '<font style="font-size:9px">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</font>&nbsp;&nbsp;'
        t = f"<u><b>{text}</b></u>" if is_pk else text
        vertex(page, f"{cid}_r{i}", cid, k + t,
               f"text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=8;html=1;whiteSpace=nowrap;fontFamily={FONT};fontSize=11;",
               0, yy, width, ROW)
        yy += ROW
    return h


def area_box(page, aid, key, x, y, w, h):
    fill, sfill, label = AREA[key]
    lane(page, aid, label, fill, sfill, "#666666", x, y, w, h)


def title_block(page, x, y, title, sub):
    vertex(page, "title", "1", f'<b style="font-size:26px">{escape(title)}</b><br><span style="font-size:13px;color:#555555">{escape(sub)}</span>',
           f"text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontFamily={FONT};", x, y, 1600, 70)


def legend(page, x, y, items, notes):
    vertex(page, "legend", "1", "LEGEND",
           f"swimlane;startSize=26;html=1;fontSize=12;fontStyle=1;rounded=1;arcSize=3;fillColor=#f5f5f5;swimlaneFillColor=#ffffff;strokeColor=#999999;container=1;collapsible=0;fontFamily={FONT};",
           x, y, 300, 40 + 26 * len(items) + 22 * len(notes))
    yy = 36
    for i, s in enumerate(items):
        fill, stroke = STEREO[s]
        vertex(page, f"lg{i}", "legend", f"«{s}»", f"rounded=1;html=1;fillColor={fill};strokeColor={stroke};fontSize=10;fontFamily={FONT};" + ("strokeWidth=2;" if s == "Supertype" else ""), 12, yy, 110, 20)
        yy += 26
    for j, n in enumerate(notes):
        vertex(page, f"ln{j}", "legend", n, f"text;html=1;align=left;verticalAlign=middle;fontSize=10;fontFamily={FONT};whiteSpace=wrap;", 12, yy, 280, 20)
        yy += 22


def build_areas(page, rows_for, stereo_for, title_for, ids):
    """Place the four subject areas; returns positions."""
    heights = {n: HEAD + sum(8 if r is None else ROW for r in rows_for(n)) + 6 for cols in LAYOUT.values() for col in cols for n in col}

    def area_size(key):
        cols = LAYOUT[key]
        w = PAD * 2 + len(cols) * W + (len(cols) - 1) * COLGAP
        h = AREA_HEAD + PAD * 2 + max(sum(heights[n] for n in col) + ROWGAP * (len(col) - 1) for col in cols)
        return w, h

    sizes = {k: area_size(k) for k in LAYOUT}
    top = 110
    bottom_keys = ["TRANSPORTATION", "PUBLIC WORKS", "HOUSING & REAL ESTATE"]
    bottom_w = sum(sizes[k][0] for k in bottom_keys) + 60 * 2
    core_w = sizes["CORE"][0]
    origin = {"CORE": (40 + max(0, (bottom_w - core_w) // 2), top)}
    by = top + sizes["CORE"][1] + 70
    bx = 40
    for k in bottom_keys:
        origin[k] = (bx, by)
        bx += sizes[k][0] + 60
    for k, cols in LAYOUT.items():
        ax, ay = origin[k]
        aid = "area_" + phys_name(k)
        area_box(page, aid, k, ax, ay, *sizes[k])
        for ci, col in enumerate(cols):
            x = PAD + ci * (W + COLGAP)
            y = AREA_HEAD + PAD
            for n in col:
                entity(page, ids[n], aid, x, y, title_for(n), stereo_for(n), rows_for(n))
                y += heights[n] + ROWGAP
    total_w = max(origin["CORE"][0] + core_w, bx) + 40
    total_h = by + max(sizes[k][1] for k in bottom_keys) + 40
    return total_w, total_h, origin, sizes


EDGE_BASE = (f"edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endFill=0;startFill=0;"
             f"strokeColor=#5c5c5c;fontSize=9;fontColor=#444444;fontFamily={FONT};jumpStyle=arc;jumpSize=6;labelBackgroundColor=#ffffff;endArrow=ERmany;")


def main(logical_sql, phys_json, out_logical, out_physical):
    ents, order, fks = parse_logical(logical_sql)
    placed = [n for cols in LAYOUT.values() for col in cols for n in col]
    assert sorted(placed) == sorted(order), (set(order) ^ set(placed))
    supertype_of = {f["child"]: f["parent"] for f in fks if f["subtype"]}
    stereo_for = lambda n: stereotype(n, supertype_of)
    ids = {n: "e_" + phys_name(n) for n in order}
    rel_fks = [f for f in fks if not f["subtype"]]

    fk_cols = {}
    for f in fks:
        for c in f["cols"]:
            fk_cols.setdefault(f["child"], set()).add(c)

    def key_rows(n, full):
        e = ents[n]
        rows = []
        for c in e["pk"]:
            tag = "PK,FK" if c in fk_cols.get(n, ()) else "PK"
            rows.append((tag, escape(c), True))
        rest = [c for c in e["cols"] if c["col"] not in e["pk"]]
        if not full:
            rest = [c for c in rest if c["col"] in fk_cols.get(n, ())]
        if rest:
            rows.append(None)
        for c in rest:
            tag = "FK" if c["col"] in fk_cols.get(n, ()) else ""
            txt = escape(c["col"])
            if full and c["domain"]:
                txt += f' <font color="#888888">: {escape(c["domain"])}</font>'
            if not c["nn"]:
                txt += ' <font color="#aaaaaa">(O)</font>'
            rows.append((tag, txt, False))
        return rows

    n_sub = sum(1 for f in fks if f["subtype"])
    nullable = {(n, c["col"]): not c["nn"] for n in ents for c in ents[n]["cols"]}

    # ---------------- logical file ----------------
    doc = Doc()
    for pid, pname, full in (("logical_keys", "Logical Model V1 (key-based)", False),
                             ("logical_full", "Logical Model V1 (all attributes)", True)):
        page = doc.page(pid, pname, 4200, 3000)
        w, h, origin, sizes = build_areas(page, lambda n, full=full: key_rows(n, full), stereo_for, lambda n: n, ids)
        page["w"], page["h"] = w + 340, h
        title_block(page, 40, 20, "Halifax Digital Twin  ·  Logical Data Model V1",
                    f"{len(order)} entities  ·  {len(fks)} relationships ({n_sub} subtype, {len(rel_fks)} shown as lines)  ·  4 subject areas  ·  "
                    + ("keys only (PK, FK)" if not full else "all attributes with logical domains"))
        for i, f in enumerate(rel_fks):
            opt = any(nullable.get((f["child"], c), False) for c in f["cols"])
            verb = f["phrase"][len(f["parent"]) + 1:]
            verb = verb[: -len(f["child"])].strip() if verb.endswith(f["child"]) else verb
            edge(page, f"r{i}", ids[f["parent"]], ids[f["child"]], verb,
                 EDGE_BASE + ("startArrow=ERzeroToOne;" if opt else "startArrow=ERmandOne;"))
        legend(page, w, 110, ["Supertype", "Event", "Asset", "Location", "Party", "Reference", "Associative"],
               ["«Event» «Asset» «Location» «Party» = subtype:", "shares its parent's key (PK,FK); no line drawn",
                "─┤├─<  one to many (mandatory)", "─○├─<  zero-or-one to many (optional FK)",
                "PK primary key · FK foreign key", "(O) optional attribute"])
    open(out_logical, "w", encoding="utf-8").write(doc.xml())

    # ---------------- physical file ----------------
    tables = json.load(open(phys_json, encoding="utf-8"))
    silver = {t["name"]: t for t in tables if t["schema"] == "silver"}
    missing = [n for n in order if phys_name(n) not in silver]
    assert not missing, missing

    def phys_rows(n):
        t = silver[phys_name(n)]
        fkc = {c for f in (t["fks"] or []) for c in f["cols"]}
        rows = []
        for c in t["cols"]:
            if c["pk"]:
                rows.append(("PK,FK" if c["col"] in fkc else "PK", f'{escape(c["col"])} <font color="#888888">{escape(c["type"])}</font>', True))
        rest = [c for c in t["cols"] if not c["pk"] and c["col"] in fkc]
        if rest:
            rows.append(None)
        for c in rest:
            rows.append(("FK", f'{escape(c["col"])} <font color="#888888">{escape(c["type"])}{"" if c["nn"] else " NULL"}</font>', False))
        return rows

    pdoc = Doc()
    page = pdoc.page("physical_silver", "Physical · silver (3NF)", 4200, 3000)
    w, h, origin, sizes = build_areas(page, phys_rows, stereo_for, phys_name, ids)
    page["w"], page["h"] = w + 340, h
    phys_fks = [(t["name"], f) for t in silver.values() for f in (t["fks"] or [])]
    sub_pairs = {(phys_name(f["child"]), phys_name(f["parent"])) for f in fks if f["subtype"]}
    by_phys = {phys_name(n): n for n in order}
    drawn = 0
    for i, (child, f) in enumerate(phys_fks):
        if (child, f["ref"]) in sub_pairs and len(f["cols"]) == 1 and f["cols"][0].endswith("_id") and child in by_phys:
            # subtype key (same PK as the supertype): shown by the stereotype, not a line
            pk = [c["col"] for c in silver[child]["cols"] if c["pk"]]
            if f["cols"] == pk:
                continue
        if f["ref"] not in by_phys or child not in by_phys:
            continue
        nullable_p = any(not c["nn"] for c in silver[child]["cols"] if c["col"] in f["cols"])
        edge(page, f"p{i}", ids[by_phys[f["ref"]]], ids[by_phys[child]], ", ".join(f["cols"]),
             EDGE_BASE + ("startArrow=ERzeroToOne;" if nullable_p else "startArrow=ERmandOne;"))
        drawn += 1
    title_block(page, 40, 20, "Halifax Digital Twin  ·  Physical Data Model V1  ·  silver schema",
                f"PostgreSQL 18 + PostGIS  ·  database halifax_twin  ·  {len(silver)} tables, {len(phys_fks)} foreign keys ({drawn} drawn; subtype keys shown by colour)  ·  every table also has dw_loaded_ts, dw_batch_id and an SCD2 _hist twin")
    legend(page, w, 110, ["Supertype", "Event", "Asset", "Location", "Party", "Reference", "Associative"],
           ["Subtype tables share the supertype key", "(PK,FK); no line drawn", "line label = FK column(s)",
            "NULL = optional foreign key", "Keys shown; other columns omitted"])

    # page 2: bronze + gold star schema
    gold = {t["name"]: t for t in tables if t["schema"] == "gold"}
    bronze = [t for t in tables if t["schema"] == "bronze"]
    page2 = pdoc.page("physical_gold", "Physical · bronze & gold (star)", 3200, 2200)
    title_block(page2, 40, 20, "Halifax Digital Twin  ·  Physical Data Model V1  ·  bronze & gold",
                "Bronze = raw feed register  ·  Gold = Kimball star schemas built by dbt from silver  ·  4 facts, 7 conformed dimensions")
    GW = 300
    fact_keys = {"service_date", "arrival_date", "hour_of_day", "route_asset_id", "stop_asset_id", "subsector_id", "source_id",
                 "start_date", "issue_date", "completion_date", "prev_stop_asset_id"}

    def gold_rows(t, pk_cols, keys):
        rows = []
        for c in t["cols"]:
            if c["col"] in pk_cols:
                rows.append(("PK", f'{escape(c["col"])} <font color="#888888">{escape(c["type"])}</font>', True))
        rows.append(None)
        for c in t["cols"]:
            if c["col"] not in pk_cols:
                rows.append(("FK" if c["col"] in keys else "", f'{escape(c["col"])} <font color="#888888">{escape(c["type"])}</font>', False))
        return rows

    pks = {"dim_date": ["calendar_date"], "dim_time_of_day": ["hour_of_day"], "dim_sector": ["subsector_id"],
           "dim_source": ["source_id"], "dim_route": ["route_asset_id"], "dim_stop": ["stop_asset_id"],
           "dim_route_segment_distance": ["route_asset_id", "from_stop_asset_id", "to_stop_asset_id"],
           "fact_stop_arrival": ["arrival_event_id"], "fact_scheduled_trip_daily": ["service_date", "scheduled_trip_id"],
           "fact_road_closure": ["closure_event_id"], "fact_building_permit": ["permit_event_id"]}
    hts = {}

    def put(name, parent, x, y, stereo, keys=frozenset()):
        t = gold[name]
        hts[name] = entity(page2, "g_" + name, parent, x, y, name, stereo, gold_rows(t, pks[name], keys), GW)

    # bronze lane
    bt = bronze[0]
    brows = [("PK" if c["pk"] else "", f'{escape(c["col"])} <font color="#888888">{escape(c["type"])}</font>', c["pk"]) for c in bt["cols"]]
    bh = HEAD + ROW * len(brows) + 6
    lane(page2, "lane_bronze", "BRONZE  ·  raw", "#f8cecc", "#fff8f7", "#b85450", 40, 110, GW + 2 * PAD, AREA_HEAD + 2 * PAD + bh + 120)
    entity(page2, "b_feed_fetch", "lane_bronze", PAD, AREA_HEAD + PAD, "feed_fetch", "Reference", brows, GW)
    vertex(page2, "b_note", "lane_bronze", "Raw feed files are kept on disk for 7 days (C:\\halifax-twin-data). This register is never deleted. Each loader writes here and to silver in the same run.",
           f"text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=11;fontColor=#555555;fontFamily={FONT};", PAD, AREA_HEAD + PAD + bh + 14, GW, 100)

    # gold lane: shared dims (top), facts (middle), transit dims (bottom)
    gx0 = 40 + GW + 2 * PAD + 60
    top_dims = ["dim_date", "dim_time_of_day", "dim_sector", "dim_source"]
    facts = ["fact_stop_arrival", "fact_scheduled_trip_daily", "fact_road_closure", "fact_building_permit"]
    bot_dims = ["dim_route", "dim_stop", "dim_route_segment_distance"]
    colx = [PAD + i * (GW + COLGAP) for i in range(4)]
    lane_w = 2 * PAD + 4 * GW + 3 * COLGAP

    def h_of(name, keys=frozenset()):
        return HEAD + ROW * len(gold[name]["cols"]) + 8 + 6

    y1 = AREA_HEAD + PAD
    y2 = y1 + max(h_of(n) for n in top_dims) + 110
    y3 = y2 + max(h_of(n) for n in facts) + 110
    lane_h = y3 + max(h_of(n) for n in bot_dims) + PAD
    lane(page2, "lane_gold", "GOLD  ·  star schemas (dbt)", "#fff2cc", "#fffdf5", "#d6b656", gx0, 110, lane_w, lane_h)
    for i, n in enumerate(top_dims):
        put(n, "lane_gold", colx[i], y1, "Reference")
    for i, n in enumerate(facts):
        put(n, "lane_gold", colx[i], y2, "Event", fact_keys)
    for i, n in enumerate(bot_dims):
        put(n, "lane_gold", colx[i], y3, "Asset")
    rels = [("dim_date", "fact_stop_arrival", "service_date"), ("dim_time_of_day", "fact_stop_arrival", "hour_of_day"),
            ("dim_sector", "fact_stop_arrival", "subsector_id"), ("dim_source", "fact_stop_arrival", "source_id"),
            ("dim_route", "fact_stop_arrival", "route_asset_id"), ("dim_stop", "fact_stop_arrival", "stop_asset_id"),
            ("dim_route_segment_distance", "fact_stop_arrival", "route + prev stop + stop"),
            ("dim_date", "fact_scheduled_trip_daily", "service_date"), ("dim_route", "fact_scheduled_trip_daily", "route_asset_id"),
            ("dim_date", "fact_road_closure", "start_date"), ("dim_sector", "fact_road_closure", "subsector_id"),
            ("dim_source", "fact_road_closure", "source_id"),
            ("dim_date", "fact_building_permit", "issue_date"), ("dim_sector", "fact_building_permit", "subsector_id"),
            ("dim_source", "fact_building_permit", "source_id")]
    STRAIGHT = (f"html=1;endFill=0;startFill=0;strokeColor=#5c5c5c;fontSize=9;fontColor=#444444;fontFamily={FONT};"
                "labelBackgroundColor=#fffdf5;endArrow=ERmany;startArrow=ERmandOne;dashed=1;")
    col_of = {n: i for i, n in enumerate(top_dims)} | {n: i for i, n in enumerate(facts)} | {n: i for i, n in enumerate(bot_dims)}
    top_out = {d: [r for r in rels if r[0] == d] for d in top_dims}
    fact_in_top = {f: [r for r in rels if r[1] == f and r[0] in top_dims] for f in facts}
    fact_in_bot = {f: [r for r in rels if r[1] == f and r[0] in bot_dims] for f in facts}
    spread = lambda k, n: round(0.5 if n == 1 else 0.2 + 0.6 * k / (n - 1), 3)
    for i, r in enumerate(rels):
        d, f, lab = r
        if d in top_dims:
            ex = spread(sorted(top_out[d], key=lambda q: col_of[q[1]]).index(r), len(top_out[d]))
            en = spread(sorted(fact_in_top[f], key=lambda q: col_of[q[0]]).index(r), len(fact_in_top[f]))
            edge(page2, f"g{i}", "g_" + d, "g_" + f, lab, STRAIGHT + f"exitX={ex};exitY=1;entryX={en};entryY=0;")
        else:
            outs = [q for q in rels if q[0] == d]
            ex = spread(outs.index(r), len(outs))
            en = spread(sorted(fact_in_bot[f], key=lambda q: col_of[q[0]]).index(r), len(fact_in_bot[f]))
            pts = None
            if d == "dim_route" and f == "fact_scheduled_trip_daily":
                gapx = gx0 + colx[0] + GW + COLGAP // 2
                pts = [(gapx, 110 + y3 - 40), (gapx, 110 + y2 + h_of(f) + 40)]
                ex, en = 0.85, 0.15
            edge(page2, f"g{i}", "g_" + d, "g_" + f, lab, STRAIGHT + f"exitX={ex};exitY=0;entryX={en};entryY=1;", pts)
    vertex(page2, "g_note", "1",
           "Dashed lines = relationships declared in the BI model and checked by dbt tests (GOLD-DQ-002); gold has no database foreign keys.<br>"
           "«Reference» = conformed / shared dimension · «Event» = fact table · «Asset» = transit dimension",
           f"text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=11;fontColor=#555555;fontFamily={FONT};",
           gx0, 110 + lane_h + 12, lane_w, 40)
    page2["w"], page2["h"] = gx0 + lane_w + 40, 110 + lane_h + 80
    open(out_physical, "w", encoding="utf-8").write(pdoc.xml())
    print("logical:", len(order), "entities,", len(rel_fks), "lines,", n_sub, "subtype links")
    print("physical silver:", len(silver), "tables,", drawn, "lines; gold:", len(gold), "tables")


if __name__ == "__main__":
    main(*sys.argv[1:5])
