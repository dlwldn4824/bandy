HEAD = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
:root { --red:#e8322f; --red-soft:#fdecec; --ink:#16181d; --sub:#5f6470; --line:#e3e5ea; --bg:#f6f7f9;
        --ok:#1f8a5b; --ok-soft:#e7f5ee; --warn:#c77700; --warn-soft:#fff4e0; --sys:#eef1f6; }
* { box-sizing:border-box }
body { margin:0; background:var(--bg); font-family:'Noto Sans KR', 'WenQuanYi Zen Hei', sans-serif; color:var(--ink); }
.board { width:max-content; min-width:__W__px; padding:48px 56px 56px; }
.top { display:flex; justify-content:space-between; align-items:flex-end; gap:24px; margin-bottom:28px; }
.eyebrow { color:var(--red); font-weight:700; letter-spacing:.08em; font-size:15px; }
h1 { margin:6px 0 6px; font-size:40px; font-weight:900; letter-spacing:-.02em; }
.lead { color:var(--sub); font-size:17px; max-width:1100px; line-height:1.55; margin:0; }
.legend { display:flex; flex-wrap:wrap; gap:10px; justify-content:flex-end; max-width:620px; }
.lg { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--sub); background:#fff; border:1px solid var(--line); border-radius:999px; padding:5px 10px; }
.sw { width:14px; height:14px; border-radius:4px; border:2px solid; display:inline-block; }
.grid { display:grid; gap:24px; }
.stack { display:grid; gap:24px; align-content:start; }
.panel { background:#fff; border:1px solid var(--line); border-radius:16px; padding:22px 24px; }
.panel h2 { margin:0 0 14px; font-size:20px; font-weight:800; display:flex; align-items:center; gap:10px; }
.panel h2 .tag { font-size:12px; font-weight:700; color:#fff; background:var(--red); border-radius:6px; padding:2px 8px; }
.mermaid { display:flex; justify-content:center; }
.cards { display:grid; gap:12px; }
.card { border:1px solid var(--line); border-radius:12px; padding:12px 14px; background:#fff; display:grid; gap:6px; font-size:14px; line-height:1.5; }
.card .h { font-weight:800; font-size:15px; display:flex; gap:8px; align-items:baseline; }
.num { flex:none; width:24px; height:24px; border-radius:50%; background:var(--red); color:#fff; font-size:13px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
.row { display:grid; grid-template-columns:64px 1fr; gap:8px; }
.k { font-size:12px; font-weight:800; border-radius:6px; padding:2px 6px; text-align:center; align-self:start; }
.k.p { background:var(--red-soft); color:var(--red); }
.k.f { background:var(--ok-soft); color:var(--ok); }
.k.v { background:var(--sys); color:#3a4a66; }
.k.d { background:var(--warn-soft); color:var(--warn); }
.card.disc { border:2px dashed var(--warn); background:#fffaf0; }
.foot { margin-top:22px; color:var(--sub); font-size:13px; display:flex; justify-content:space-between; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th { text-align:left; background:var(--ink); color:#fff; padding:9px 10px; font-weight:700; }
td { padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; line-height:1.5; }
tr.grp td { background:var(--red-soft); font-weight:800; color:var(--red); }
td .ok { color:var(--ok); font-weight:700; }
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
mermaid.initialize({ startOnLoad:true, theme:'base', securityLevel:'loose',
  flowchart:{ htmlLabels:true, curve:'basis', nodeSpacing:28, rankSpacing:42, padding:10, useMaxWidth:false },
  themeVariables:{ fontFamily:"'Noto Sans KR', sans-serif", fontSize:'15px', primaryColor:'#ffffff', primaryBorderColor:'#16181d',
    primaryTextColor:'#16181d', lineColor:'#8a909c', clusterBkg:'#fafbfc', clusterBorder:'#d5d9e0', edgeLabelBackground:'#ffffff' } });
</script></head><body><div class="board">"""

CLASSDEFS = """
classDef user fill:#ffffff,stroke:#16181d,stroke-width:1.5px,color:#16181d;
classDef screen fill:#ffffff,stroke:#e8322f,stroke-width:2.5px,color:#16181d,font-weight:700;
classDef sys fill:#eef1f6,stroke:#9aa3b2,stroke-width:1px,color:#26324a;
classDef dec fill:#fff,stroke:#e8322f,stroke-width:1.5px,color:#16181d;
classDef prob fill:#fdecec,stroke:#e8322f,stroke-width:1.5px,color:#9b1c1a;
classDef fix fill:#e7f5ee,stroke:#1f8a5b,stroke-width:1.5px,color:#14573a;
classDef disc fill:#fffaf0,stroke:#c77700,stroke-width:2px,stroke-dasharray:6 4,color:#7a4a00;
"""

LEGEND = """<div class="legend">
<span class="lg"><span class="sw" style="border-color:#e8322f"></span>화면</span>
<span class="lg"><span class="sw" style="border-color:#16181d"></span>사용자 행동</span>
<span class="lg"><span class="sw" style="border-color:#9aa3b2;background:#eef1f6"></span>서버 처리</span>
<span class="lg"><span class="sw" style="border-color:#e8322f;transform:rotate(45deg) scale(.8)"></span>판단</span>
<span class="lg"><span class="sw" style="border-color:#e8322f;background:#fdecec"></span>문제·변수</span>
<span class="lg"><span class="sw" style="border-color:#1f8a5b;background:#e7f5ee"></span>해결</span>
<span class="lg"><span class="sw" style="border-color:#c77700;border-style:dashed;background:#fffaf0"></span>논의 필요</span>
</div>"""

def page(width, eyebrow, title, lead, body, foot="BANDY · 2026-11-17 · 브랜치 claude/bandy-handoff-vhwx0u"):
    return HEAD.replace('__W__', str(width)) + f"""
<div class="top"><div><div class="eyebrow">{eyebrow}</div><h1>{title}</h1><p class="lead">{lead}</p></div>{LEGEND}</div>
{body}
<div class="foot"><span>{foot}</span><span>흰 바탕 + 빨강 · 흐름 파악용</span></div>
</div></body></html>"""

def card(n, title, rows, cls=''):
    r = ''.join(f'<div class="row"><span class="k {k}">{lab}</span><span>{txt}</span></div>' for k, lab, txt in rows)
    numhtml = f'<span class="num">{n}</span>' if n else ''
    return f'<div class="card {cls}"><div class="h">{numhtml}<span>{title}</span></div>{r}</div>'
