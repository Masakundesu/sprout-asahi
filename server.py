#!/usr/bin/env python3
"""SPROUT local server — static files + live ingestion from free sources.

REAL sources (no API keys, no paid contracts required):
  Broad RSS/Atom:  TechCrunch, The Verge, Wired, MIT Tech Review,
                   Fast Company, NYT Business, BRIDGE (JP)
  Targeted RSS :   Google News search-RSS (9 Asahi-domain queries × EN/JP)
  JSON API     :   Hacker News (Algolia public search) across multiple queries

Pipeline per /api/articles request:
  1. Fetch each source (parallel threads, per-source timeout)
  2. Parse RSS 2.0 / Atom / RDF → normalize to common shape
  3. Score relevance against 8 Asahi R&D domains via word-boundary keyword match
  4. Match to seed library (YAS-17, Hop-β, CO2-LOOP...) via keywords
  5. De-dupe (URL + title) and sort (date desc, importance desc)
  6. Cache in memory for CACHE_TTL_SEC (default 15 min)

No external Python deps. Python 3.9+ stdlib only.
"""

import concurrent.futures
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT") or os.environ.get("SPROUT_PORT", "4321"))
CACHE_TTL_SEC = int(os.environ.get("SPROUT_CACHE_TTL", "900"))  # 15 min
FETCH_TIMEOUT = 15

# --- LLM config ---
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
LLM_MODEL = os.environ.get("SPROUT_LLM_MODEL", "claude-haiku-4-5-20251001")
LLM_TOP_N = int(os.environ.get("SPROUT_LLM_TOP_N", "20"))  # only summarize top-N by relevance
_llm_cache = {}  # url -> {"summary": [...], "at": ts}  (persistent across request cycles)

# -----------------------------------------------------------------------------
# Source catalogue
# -----------------------------------------------------------------------------
def gnews(q: str, lang: str = "en", region: str = "US") -> str:
    hl = "en-US" if lang == "en" else "ja"
    gl = region
    ceid = f"{region}:{lang}"
    return (
        "https://news.google.com/rss/search?"
        f"q={urllib.parse.quote(q)}&hl={hl}&gl={gl}&ceid={ceid}"
    )

DEFAULT_SOURCES = [
    # Broad tech/business feeds
    dict(id="techcrunch",  name="TechCrunch",      url="https://techcrunch.com/feed/",                          type="海外テック",           category="海外/先進企業事例", region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="verge",       name="The Verge",       url="https://www.theverge.com/rss/index.xml",                type="海外テック",           category="海外/先進企業事例", region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="mit",         name="MIT Tech Review", url="https://www.technologyreview.com/feed/",                type="学術/テック",          category="海外/先進企業事例", region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="wired",       name="Wired",           url="https://www.wired.com/feed/rss",                        type="海外トレンド",         category="生活者トレンド",    region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="fc",          name="Fast Company",    url="https://www.fastcompany.com/latest/rss",                type="海外トレンド",         category="生活者トレンド",    region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="nyt",         name="NYT Business",    url="https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", type="海外メディア",     category="市場統計",          region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="bridge",      name="BRIDGE",          url="https://thebridge.jp/feed",                             type="国内スタートアップ",    category="海外/先進企業事例", region="国内", lang="JP", enabled=True, builtin=True),
    dict(id="prtimes",     name="PR TIMES",        url="https://prtimes.jp/index.rdf",                          type="国内発表",             category="市場統計",          region="国内", lang="JP", enabled=True, builtin=True),

    # Google News RSS — targeted queries. Gives domain-specific deep coverage.
    dict(id="gn_nonalc",      name="Google News · Non-alc",       url=gnews('("non-alcoholic beer" OR "zero-proof" OR sober) beverage'),                  type="海外ニュース検索", category="生活者トレンド",   region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="gn_ferm",        name="Google News · Fermentation",  url=gnews('fermentation OR kombucha OR "yeast strain" startup'),                      type="海外ニュース検索", category="海外/先進企業事例", region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="gn_gut",         name="Google News · Gut/Wellness",  url=gnews('"gut microbiome" OR probiotic OR "GLP-1" beverage'),                        type="海外ニュース検索", category="市場統計",          region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="gn_pkg",         name="Google News · Packaging",     url=gnews('"sustainable packaging" OR "paper bottle" beverage'),                       type="海外ニュース検索", category="海外/先進企業事例", region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="gn_upcyc",       name="Google News · Upcycling",     url=gnews('"spent grain" OR "upcycled" food beverage'),                                 type="海外ニュース検索", category="海外/先進企業事例", region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="gn_co2",         name="Google News · Carbon",        url=gnews('"carbon capture" OR "net zero" beverage OR brewery'),                       type="海外ニュース検索", category="市場統計",          region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="gn_senior",      name="Google News · Senior",        url=gnews('"dysphagia" OR elderly beverage OR senior nutrition'),                      type="海外ニュース検索", category="市場統計",          region="海外", lang="EN", enabled=True, builtin=True),
    dict(id="gn_jp_nonalc",   name="Google News · ノンアル (JP)", url=gnews("ノンアル OR 低アルコール OR 機能性飲料", lang="ja", region="JP"),          type="国内ニュース検索",   category="生活者トレンド",   region="国内", lang="JP", enabled=True, builtin=True),
    dict(id="gn_jp_ferm",     name="Google News · 発酵 (JP)",     url=gnews("発酵 OR 酵母 OR 乳酸菌 スタートアップ", lang="ja", region="JP"),           type="国内ニュース検索",   category="海外/先進企業事例", region="国内", lang="JP", enabled=True, builtin=True),
    dict(id="gn_jp_sustain",  name="Google News · サステナ (JP)", url=gnews("サステナ OR 脱炭素 OR 紙パッケージ 飲料", lang="ja", region="JP"),         type="国内ニュース検索",   category="市場統計",          region="国内", lang="JP", enabled=True, builtin=True),

    # Hacker News via Algolia (special)
    dict(id="hn",          name="Hacker News",     type="海外スタートアップ",    category="海外/先進企業事例", region="海外", lang="EN", custom="hn", enabled=True, builtin=True),
]

# Curated preset library — quick-add catalogue offered in UI
PRESET_SOURCES = [
    dict(id="nikkei",       name="日経新聞",                  url="https://www.nikkei.com/rss/news.xml",                       type="国内メディア",       category="市場統計",          region="国内", lang="JP"),
    dict(id="dhbr",         name="Harvard Business Review JP", url="https://dhbr.diamond.jp/feed",                              type="経営/学術",          category="市場統計",          region="国内", lang="JP"),
    dict(id="axios",        name="Axios",                     url="https://api.axios.com/feed/",                               type="海外メディア",       category="市場統計",          region="海外", lang="EN"),
    dict(id="forbesjp",     name="Forbes JAPAN",              url="https://forbesjapan.com/feed",                              type="国内ビジネス",       category="生活者トレンド",    region="国内", lang="JP"),
    dict(id="natfood",      name="Nature Food",               url="https://www.nature.com/natfood.rss",                        type="学術論文",           category="海外/先進企業事例", region="海外", lang="EN"),
    dict(id="foodnav",      name="Food Navigator",            url="https://www.foodnavigator.com/Info/RSS-feeds",              type="業界専門",           category="海外/先進企業事例", region="海外", lang="EN"),
    dict(id="beverage_d",   name="Beverage Daily",            url="https://www.beveragedaily.com/Info/RSS-feeds",              type="業界専門",           category="海外/先進企業事例", region="海外", lang="EN"),
    dict(id="impress",      name="Impress Watch (食)",        url="https://internet.watch.impress.co.jp/cda/rss/internet.rdf", type="国内テック",         category="生活者トレンド",    region="国内", lang="JP"),
    dict(id="gn_jp_health", name="Google News · 機能性食品 (JP)", url=gnews("機能性表示食品 OR 健康食品 トレンド", lang="ja", region="JP"),         type="国内ニュース検索",   category="生活者トレンド",   region="国内", lang="JP"),
]

# -----------------------------------------------------------------------------
# Sources persistence (JSON file, alongside server.py)
# -----------------------------------------------------------------------------
SOURCES_FILE = os.path.join(BASE_DIR, "sources.json")
_sources_lock = threading.Lock()

def _load_sources_from_disk():
    """Load sources from JSON file. Falls back to DEFAULT_SOURCES on first run."""
    if not os.path.exists(SOURCES_FILE):
        return [dict(s) for s in DEFAULT_SOURCES]
    try:
        with open(SOURCES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list) and data:
            # ensure every default builtin still exists in case we added new ones
            existing_ids = {s["id"] for s in data}
            merged = list(data)
            for d in DEFAULT_SOURCES:
                if d["id"] not in existing_ids:
                    merged.append(dict(d))
            return merged
    except Exception as e:
        print(f"[sources] load error: {e}", file=sys.stderr)
    return [dict(s) for s in DEFAULT_SOURCES]

def _save_sources_to_disk(sources):
    try:
        with open(SOURCES_FILE, "w", encoding="utf-8") as f:
            json.dump(sources, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[sources] save error: {e}", file=sys.stderr)

# Module-level mutable list (replaces old global SOURCES)
SOURCES = _load_sources_from_disk()

def get_sources():
    with _sources_lock:
        return [dict(s) for s in SOURCES]

def get_enabled_sources():
    with _sources_lock:
        return [dict(s) for s in SOURCES if s.get("enabled", True)]

def upsert_source(patch: dict, source_id: str = None):
    """Update existing or insert new source. Returns the resulting source dict."""
    with _sources_lock:
        if source_id:
            for i, s in enumerate(SOURCES):
                if s["id"] == source_id:
                    # builtin sources can be toggled but URL/name fields are still editable
                    SOURCES[i] = {**s, **patch, "id": source_id}
                    _save_sources_to_disk(SOURCES)
                    return dict(SOURCES[i])
            raise KeyError(source_id)
        # create new
        new_id = patch.get("id") or "u_" + re.sub(r"[^a-z0-9]+", "", (patch.get("name", "") or "src").lower())[:20] + "_" + str(int(time.time()))[-5:]
        new = {
            "id": new_id, "name": patch.get("name", "(無題)"), "url": patch.get("url", ""),
            "type": patch.get("type", "カスタム"), "category": patch.get("category", "海外/先進企業事例"),
            "region": patch.get("region", "海外"), "lang": patch.get("lang", "EN"),
            "enabled": patch.get("enabled", True), "builtin": False,
        }
        SOURCES.append(new)
        _save_sources_to_disk(SOURCES)
        return dict(new)

def delete_source(source_id: str):
    """Delete a non-builtin source. For builtins, disable instead."""
    with _sources_lock:
        for i, s in enumerate(SOURCES):
            if s["id"] == source_id:
                if s.get("builtin"):
                    SOURCES[i] = {**s, "enabled": False}
                else:
                    del SOURCES[i]
                _save_sources_to_disk(SOURCES)
                return True
        return False

# -----------------------------------------------------------------------------
# Relevance: 8 Asahi R&D domains × keyword lists
# EN keywords = word-boundary regex; JP keywords = substring
# -----------------------------------------------------------------------------
RELEVANCE = {
    "発酵/酵母":        dict(en=["fermentation", "fermented", "yeast", "brewing", "brewery", "koji", "kombucha", "sake"],
                           jp=["発酵", "酵母", "醸造", "麹", "菌株", "コンブチャ"]),
    "飲料全般":         dict(en=["beverage", "beverages", "non-alcoholic", "nonalcoholic", "mocktail", "beer", "wine", "whisky", "whiskey", "cocktail", "sober", "spirits"],
                           jp=["飲料", "ビール", "ノンアル", "低アル", "ワイン", "日本酒", "スピリッツ", "カクテル"]),
    "健康/機能性":      dict(en=["gut", "probiotic", "prebiotic", "microbiome", "glp-1", "wellness", "functional food", "supplement", "adaptogen", "nootropic"],
                           jp=["機能性表示", "機能性食品", "腸活", "腸内", "乳酸菌", "プロバイオ", "ウェルネス", "サプリ", "リラックス"]),
    "サステナ":         dict(en=["sustainability", "sustainable", "climate", "carbon capture", "co2 capture", "net zero", "net-zero", "esg", "circular economy"],
                           jp=["サステナ", "脱炭素", "カーボンニュートラル", "循環経済", "CO2", "SDGs"]),
    "パッケージ":       dict(en=["packaging", "paper bottle", "paper pack", "recyclable", "compostable", "pet bottle", "refill"],
                           jp=["パッケージ", "紙容器", "紙ボトル", "紙パック", "リサイクル", "PET", "容器"]),
    "生活者/世代":      dict(en=["gen z", "millennial", "consumer trend", "lifestyle trend", "sober curious", "mindful drinking"],
                           jp=["Z世代", "ミレニアル", "生活者", "ライフスタイル"]),
    "食/アップサイクル": dict(en=["upcycled", "upcycling", "spent grain", "byproduct", "alt protein", "alternative protein", "plant-based", "plant based", "cultivated meat"],
                           jp=["アップサイクル", "副産物", "代替肉", "代替タンパク", "プラントベース"]),
    "AI/R&D":          dict(en=["ai-designed", "generative food", "flavor ai", "food science", "food tech", "biotech startup"],
                           jp=["AI食品", "AI香味", "AIレシピ", "フードテック"]),
}

SEED_KEYWORDS = {
    "s_yas17":       dict(en=["yeast", "aroma", "ester", "flavor", "brewing", "brewery"],
                          jp=["酵母", "香気", "フレーバー", "醸造"]),
    "s_hopbeta":     dict(en=["hop", "hops", "relax", "calm", "sleep", "stress", "wellness", "adaptogen", "gaba"],
                          jp=["ホップ", "リラックス", "睡眠", "ストレス", "ウェルネス"]),
    "s_co2loop":     dict(en=["carbon capture", "co2 capture", "emission", "sustainability", "climate", "net zero", "net-zero"],
                          jp=["脱炭素", "カーボンニュートラル", "CO2回収"]),
    "s_paperpack":   dict(en=["packaging", "paper bottle", "paper pack", "pet bottle", "recyclable", "compostable"],
                          jp=["容器", "パッケージ", "紙パック", "紙ボトル", "紙容器"]),
    "s_lb4012":      dict(en=["gut", "probiotic", "microbiome", "prebiotic"],
                          jp=["腸内", "乳酸菌", "菌叢", "プロバイオ"]),
    "s_realzero":    dict(en=["non-alcoholic", "nonalcoholic", "zero proof", "zero-proof", "sober", "mocktail"],
                          jp=["ノンアル", "低アル", "ゼロアル"]),
    "s_microfd":     dict(en=["freeze dry", "freeze-dry", "freeze dried", "powder drink", "instant drink"],
                          jp=["フリーズドライ", "粉末", "スティック飲料"]),
    "s_flavorai":    dict(en=["flavor ai", "ai-designed flavor", "generative food", "recipe ai", "food ai"],
                          jp=["香味設計", "AIレシピ"]),
    "s_huskprotein": dict(en=["upcycled", "spent grain", "byproduct", "alt protein", "plant protein"],
                          jp=["アップサイクル", "麦芽粕", "代替タンパク", "代替肉"]),
    "s_swallow":     dict(en=["dysphagia", "swallow", "elderly", "senior nutrition"],
                          jp=["嚥下", "高齢者", "シニア", "介護食"]),
}

# -----------------------------------------------------------------------------
# Cache
# -----------------------------------------------------------------------------
_cache = {"articles": None, "status": {}, "ts": 0}
_cache_lock = threading.Lock()


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._chunks = []
    def handle_data(self, d):
        self._chunks.append(d)
    def text(self):
        return " ".join("".join(self._chunks).split())

def strip_html(s: str) -> str:
    if not s:
        return ""
    p = _HTMLStripper()
    try:
        p.feed(s)
    except Exception:
        return s
    return p.text()

def parse_date(s: str) -> str:
    if not s:
        return ""
    try:
        return parsedate_to_datetime(s).date().isoformat()
    except Exception:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except Exception:
            continue
    return s[:10]


_opener = urllib.request.build_opener()
_opener.addheaders = [
    ("User-Agent", "SPROUT/1.0 (local demo; Asahi R&D Ideation Hub)"),
    ("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8"),
    ("Accept-Language", "en,ja;q=0.8"),
]

def http_get(url: str, timeout: int = FETCH_TIMEOUT) -> bytes:
    with _opener.open(url, timeout=timeout) as r:
        return r.read()


# -----------------------------------------------------------------------------
# RSS / Atom / RDF parsers
# -----------------------------------------------------------------------------
# RSS 2.0, Atom, RDF all share the "<item>" or "<entry>" structure but with
# different namespacing. We try each and pick whichever yields results.

RDF_NS  = "{http://purl.org/rss/1.0/}"
ATOM_NS = "{http://www.w3.org/2005/Atom}"
DC_NS   = "{http://purl.org/dc/elements/1.1/}"
CONTENT_NS = "{http://purl.org/rss/1.0/modules/content/}"

def fetch_rss(src: dict) -> list:
    data = http_get(src["url"])
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        root = ET.fromstring(data.lstrip())

    items = []

    # RSS 2.0 — item has no namespace
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        desc = (item.findtext("description") or item.findtext(CONTENT_NS + "encoded") or "")
        d = (item.findtext("pubDate") or item.findtext(DC_NS + "date") or "")
        if title and link:
            items.append({"title": title, "link": link, "desc": strip_html(desc), "date": parse_date(d)})

    # RDF (PR TIMES) — items live under default RSS 1.0 namespace
    if not items:
        for item in root.iter(RDF_NS + "item"):
            title = (item.findtext(RDF_NS + "title") or "").strip()
            link = (item.findtext(RDF_NS + "link") or "").strip()
            desc = (item.findtext(RDF_NS + "description") or item.findtext(CONTENT_NS + "encoded") or "")
            d = (item.findtext(DC_NS + "date") or "")
            if title and link:
                items.append({"title": title, "link": link, "desc": strip_html(desc), "date": parse_date(d)})

    # Atom
    if not items:
        for entry in root.iter(ATOM_NS + "entry"):
            title = (entry.findtext(ATOM_NS + "title") or "").strip()
            link_el = entry.find(ATOM_NS + "link[@rel='alternate']")
            if link_el is None:
                link_el = entry.find(ATOM_NS + "link")
            link = link_el.get("href") if link_el is not None else ""
            desc = (entry.findtext(ATOM_NS + "summary") or entry.findtext(ATOM_NS + "content") or "")
            d = (entry.findtext(ATOM_NS + "updated") or entry.findtext(ATOM_NS + "published") or "")
            if title and link:
                items.append({"title": title, "link": link, "desc": strip_html(desc), "date": parse_date(d)})
    return items[:40]


# -----------------------------------------------------------------------------
# Hacker News (Algolia) — Algolia doesn't natively support OR in query;
# issue one query per term and merge.
# -----------------------------------------------------------------------------
HN_TERMS = [
    "brewing", "fermentation", "yeast", "kombucha",
    "non-alcoholic", "mocktail", "sober curious",
    "gut microbiome", "probiotic", "GLP-1",
    "sustainable packaging", "paper bottle", "carbon capture",
    "food tech", "upcycled", "alt protein",
    "beverage startup", "craft beer",
]

def fetch_hn() -> list:
    items = []
    for term in HN_TERMS:
        try:
            url = (
                "https://hn.algolia.com/api/v1/search?"
                f"query={urllib.parse.quote(term)}"
                "&tags=story&numericFilters=points%3E30&hitsPerPage=6"
            )
            data = json.loads(http_get(url, timeout=8))
            for hit in data.get("hits", []):
                if not hit.get("url") or not hit.get("title"):
                    continue
                items.append({
                    "title": hit["title"],
                    "link": hit["url"],
                    "desc": f"Hacker News に登場 — query: '{term}' · {hit.get('points',0)} points · {hit.get('num_comments',0)} comments.",
                    "date": (hit.get("created_at", "") or "")[:10],
                    "hn_points": hit.get("points", 0),
                    "hn_query": term,
                })
        except Exception as e:
            print(f"[hn] term failed: {term} — {e}", file=sys.stderr)
    # dedupe by link, keep max points
    best = {}
    for it in items:
        prev = best.get(it["link"])
        if not prev or it.get("hn_points", 0) > prev.get("hn_points", 0):
            best[it["link"]] = it
    out = sorted(best.values(), key=lambda x: x.get("hn_points", 0), reverse=True)
    return out[:40]


# -----------------------------------------------------------------------------
# Enrichment: relevance, seed matching, importance, summary
# -----------------------------------------------------------------------------
def _en_hit(text_lower: str, kw: str) -> bool:
    # word-boundary match, case-insensitive
    return re.search(r"\b" + re.escape(kw.lower()) + r"\b", text_lower) is not None

def _jp_hit(text: str, kw: str) -> bool:
    return kw in text

def score_domains(title: str, desc: str) -> list:
    text_l = (title + " " + desc).lower()
    text   = title + " " + desc
    hits = []
    for domain, kws in RELEVANCE.items():
        if any(_en_hit(text_l, k) for k in kws.get("en", [])) or any(_jp_hit(text, k) for k in kws.get("jp", [])):
            hits.append(domain)
    return hits

def match_seeds(title: str, desc: str) -> list:
    text_l = (title + " " + desc).lower()
    text   = title + " " + desc
    out = []
    for sid, kws in SEED_KEYWORDS.items():
        if any(_en_hit(text_l, k) for k in kws.get("en", [])) or any(_jp_hit(text, k) for k in kws.get("jp", [])):
            out.append(sid)
    return out

# -----------------------------------------------------------------------------
# Summary engines — 3-line Japanese summary for an article
#   1) heuristic_summary : lead-sentence + domain-sentence + implication-sentence
#   2) llm_summarize     : Claude API (Haiku) — used as post-pass on top-N articles
# -----------------------------------------------------------------------------
# Markers used by the heuristic's "implication" sentence
_IMPLICATION_PAT = re.compile(
    r"\b(growth|market|trend|shift|potential|investment|funding|raised|surge|acceler|boom|disrupt)\b|"
    r"(市場|拡大|成長|加速|急増|兆円|億円|規模|転換|調達|資金|バブル|シフト)",
    re.IGNORECASE,
)
_NUM_PAT = re.compile(r"(\$\d[\d,\.]*|\d+[\.\d]*\s*(%|億|万|億円|兆|million|billion|m|b)\b|\d{4}年|20\d{2})", re.IGNORECASE)

def _split_sentences(s: str) -> list:
    parts = re.split(r"(?<=[\.。!?！？])\s+", (s or "").strip())
    return [p.strip() for p in parts if len(p.strip()) > 8]

def heuristic_summary(title: str, desc: str, domains: list) -> list:
    """
    Rule-based 3-line picker:
      1) Sentence that contains a concrete number/year ("lead")
      2) Sentence that mentions one of the Asahi relevance keywords (domain)
      3) Sentence with an implication verb (growth/market/trend…)
    Falls back to sequential sentences.
    """
    sentences = _split_sentences(desc)
    if not sentences:
        return [desc[:160]] if desc else [title[:160]]

    picked = []
    used = set()

    # 1) lead sentence with a number
    for s in sentences:
        if _NUM_PAT.search(s):
            picked.append(s); used.add(s); break

    # 2) domain-signal sentence
    domain_words = []
    for d in domains:
        domain_words += RELEVANCE.get(d, {}).get("en", []) + RELEVANCE.get(d, {}).get("jp", [])
    domain_words = [w.lower() for w in domain_words]
    for s in sentences:
        if s in used: continue
        sl = s.lower()
        if any(w in sl for w in domain_words):
            picked.append(s); used.add(s); break

    # 3) implication sentence
    for s in sentences:
        if s in used: continue
        if _IMPLICATION_PAT.search(s):
            picked.append(s); used.add(s); break

    # Fill missing slots sequentially
    for s in sentences:
        if len(picked) >= 3: break
        if s not in used:
            picked.append(s); used.add(s)

    return picked[:3]


def _llm_prompt(title: str, desc: str, tags: list, seeds: list, seed_names: list) -> str:
    return f"""あなたはアサヒグループホールディングスの新規事業R&D部門の情報アナリスト。
以下の記事を、研究開発チームが「朝1分で把握できる」よう**日本語3行**で要約してください。

# 制約
- 各行は80-100文字。箇条書き（・）ではなく平文。
- 1行目: 事実と数字を含む客観的な要点（誰が/何を/いくらで/いつ）
- 2行目: 業界構造・生活者動向への意味
- 3行目: 自社シーズへの示唆（下記シーズと掛けてどう活かせそうか）
- 各行は独立した文として成立させる。JSON配列で返す: ["1行目", "2行目", "3行目"]

# 検出ドメイン
{", ".join(tags) if tags else "なし"}

# 関連する自社シーズ
{", ".join(seed_names) if seed_names else "該当なし"}

# 記事
タイトル: {title}
本文:
{desc[:2500]}
"""

def llm_summarize(title: str, desc: str, tags: list, seed_ids: list, seed_names: list) -> list:
    """Call Claude API. Returns None on any failure to let heuristic stand."""
    if not ANTHROPIC_API_KEY or not desc:
        return None
    key = f"{title}|{desc[:200]}"  # small cache key (title+prefix)
    if key in _llm_cache:
        return _llm_cache[key]

    body = {
        "model": LLM_MODEL,
        "max_tokens": 500,
        "messages": [
            { "role": "user", "content": _llm_prompt(title, desc, tags, seed_ids, seed_names) }
        ]
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read())
    except Exception as e:
        print(f"[llm] fail for '{title[:40]}…': {e}", file=sys.stderr)
        _llm_cache[key] = None
        return None

    # Extract JSON array from the response
    txt = "".join(blk.get("text", "") for blk in data.get("content", []) if blk.get("type") == "text").strip()
    m = re.search(r"\[.*?\]", txt, re.DOTALL)
    if m:
        try:
            arr = json.loads(m.group(0))
            if isinstance(arr, list) and len(arr) >= 1:
                out = [str(x).strip() for x in arr if str(x).strip()][:3]
                _llm_cache[key] = out
                return out
        except Exception:
            pass
    # Fallback: split lines
    lines = [l.strip("・-•*＊ 　").strip() for l in txt.splitlines() if l.strip()]
    lines = [l for l in lines if len(l) > 10][:3]
    _llm_cache[key] = lines or None
    return lines or None


def enrich(item: dict, src: dict) -> dict:
    title = item.get("title", "")
    desc  = item.get("desc", "")
    hit_domains = score_domains(title, desc)
    seeds = match_seeds(title, desc)

    score = len(hit_domains)
    importance = max(1, min(5, 1 + score))
    if (item.get("hn_points") or 0) >= 200:
        importance = min(5, importance + 1)

    # 3-line summary (improved heuristic — LLM upgrade happens in post-pass)
    parts = heuristic_summary(title, desc, hit_domains)

    return {
        "id": f"live_{src['id']}_{abs(hash(item['link'])) % 10_000_000}",
        "title": title,
        "source": src["name"],
        "sourceType": src.get("type", ""),
        "category": src.get("category", "海外/先進企業事例"),
        "lang": src.get("lang", "EN"),
        "date": item.get("date", ""),
        "importance": importance,
        "trending": importance >= 4 or (item.get("hn_points") or 0) >= 200,
        "tags": hit_domains[:4],
        "summary": parts,
        "summaryMode": "heuristic",  # replaced to "llm" after post-pass if Claude ran
        "relatedSeeds": list(dict.fromkeys(seeds))[:3],
        "url": item["link"],
        "rawDesc": desc,  # kept for LLM post-pass; stripped from final payload
        "live": True,
        "hnPoints": item.get("hn_points"),
        "hnQuery": item.get("hn_query"),
        "relevanceScore": score,
    }


# -----------------------------------------------------------------------------
# Parallel fetch across sources
# -----------------------------------------------------------------------------
def _fetch_one(src: dict) -> tuple:
    """Fetch a single source; return (src_id, items, status_dict)."""
    t0 = time.time()
    try:
        items = fetch_hn() if src.get("custom") == "hn" else fetch_rss(src)
        return src["id"], items, {
            "ok": True,
            "total": len(items),
            "ms": int((time.time() - t0) * 1000),
        }
    except Exception as e:
        return src["id"], [], {
            "ok": False,
            "error": f"{type(e).__name__}: {str(e)[:160]}",
            "ms": int((time.time() - t0) * 1000),
        }

def fetch_all():
    articles = []
    status = {}
    active_sources = get_enabled_sources()

    # Parallel fetch — I/O bound, threads fine
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futures = { ex.submit(_fetch_one, src): src for src in active_sources }
        for fut in concurrent.futures.as_completed(futures, timeout=60):
            src = futures[fut]
            try:
                sid, items, st = fut.result()
            except Exception as e:
                status[src["id"]] = {"ok": False, "error": f"TIMEOUT/{type(e).__name__}: {str(e)[:120]}"}
                continue
            enriched = [enrich(it, src) for it in items]
            relevant = [a for a in enriched if a.get("tags")]
            articles.extend(relevant)
            st["relevant"] = len(relevant)
            status[sid] = st

    # Dedupe by URL, then by (lowercased) title
    seen_url, seen_title, out = set(), set(), []
    for a in articles:
        u = (a.get("url") or a.get("id") or "").strip()
        t = re.sub(r"\s+", " ", (a.get("title") or "").strip().lower())
        if u in seen_url or t in seen_title:
            continue
        seen_url.add(u)
        seen_title.add(t)
        out.append(a)

    # Sort: relevance score desc, date desc, importance desc
    out.sort(
        key=lambda a: (
            a.get("relevanceScore") or 0,
            a.get("date") or "0000-00-00",
            a.get("importance") or 0,
        ),
        reverse=True,
    )

    # LLM post-pass on top-N (if API key present). Parallel, bounded.
    llm_count = 0
    if ANTHROPIC_API_KEY and out:
        def _llm_job(a):
            seed_names = []
            # NOTE: we don't have seed lookups here; pass codes for prompt
            seed_names = a.get("relatedSeeds") or []
            new = llm_summarize(a["title"], a.get("rawDesc") or "", a.get("tags", []), a.get("relatedSeeds", []), seed_names)
            if new:
                a["summary"] = new
                a["summaryMode"] = "llm"
                return 1
            return 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
            futures = [ex.submit(_llm_job, a) for a in out[:LLM_TOP_N]]
            for fut in concurrent.futures.as_completed(futures, timeout=90):
                try:
                    llm_count += fut.result() or 0
                except Exception as e:
                    print(f"[llm] worker error: {e}", file=sys.stderr)

    # Strip rawDesc before returning to client (not needed in UI)
    for a in out:
        a.pop("rawDesc", None)

    # Stats
    status["_llm"] = {
        "enabled": bool(ANTHROPIC_API_KEY),
        "model": LLM_MODEL if ANTHROPIC_API_KEY else None,
        "summarized": llm_count,
        "topN": LLM_TOP_N,
    }
    return out, status


# -----------------------------------------------------------------------------
# HTTP handler
# -----------------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}\n")

    def translate_path(self, path):
        p = path.split("?")[0]
        if p == "/":
            p = "/index.html"
        return os.path.join(BASE_DIR, p.lstrip("/"))

    def do_GET(self):
        if self.path.startswith("/api/articles"):
            self._serve_articles(force="refresh=1" in self.path)
            return
        if self.path.startswith("/api/sources"):
            # /api/sources or /api/sources/presets
            tail = self.path.split("?")[0].rstrip("/").split("/")
            if len(tail) >= 4 and tail[3] == "presets":
                self._send_json({"presets": PRESET_SOURCES})
                return
            self._serve_sources()
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/sources"):
            self._mutate_source("POST")
            return
        self.send_response(405); self.end_headers()

    def do_PATCH(self):
        if self.path.startswith("/api/sources"):
            self._mutate_source("PATCH")
            return
        self.send_response(405); self.end_headers()

    def do_DELETE(self):
        if self.path.startswith("/api/sources"):
            self._mutate_source("DELETE")
            return
        self.send_response(405); self.end_headers()

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return {}

    def _mutate_source(self, method: str):
        # /api/sources                   -> POST create
        # /api/sources/<id>              -> PATCH / DELETE
        # /api/sources/<id>/refresh      -> POST refresh single
        path = self.path.split("?")[0].rstrip("/")
        parts = path.split("/")  # ['', 'api', 'sources', '<id>?', 'refresh?']
        source_id = parts[3] if len(parts) >= 4 else None
        action    = parts[4] if len(parts) >= 5 else None

        try:
            if method == "POST" and not source_id:
                body = self._read_json_body()
                if not body.get("name") or not (body.get("url") or body.get("custom")):
                    return self._send_json({"error": "name と url は必須です"}, status=400)
                created = upsert_source(body)
                # Invalidate cache so next fetch picks up new source
                with _cache_lock:
                    _cache["articles"] = None
                return self._send_json({"source": created}, status=201)

            if method == "POST" and source_id and action == "refresh":
                src = next((s for s in get_sources() if s["id"] == source_id), None)
                if not src:
                    return self._send_json({"error": "not found"}, status=404)
                _, items, st = _fetch_one(src)
                # Just return the fetch result — full re-merge happens on /api/articles
                with _cache_lock:
                    _cache["articles"] = None  # force re-fetch on next /api/articles
                return self._send_json({"id": source_id, "result": st, "fetched": len(items)})

            if method == "PATCH" and source_id:
                body = self._read_json_body()
                try:
                    updated = upsert_source(body, source_id=source_id)
                except KeyError:
                    return self._send_json({"error": "not found"}, status=404)
                with _cache_lock:
                    _cache["articles"] = None
                return self._send_json({"source": updated})

            if method == "DELETE" and source_id:
                if not delete_source(source_id):
                    return self._send_json({"error": "not found"}, status=404)
                with _cache_lock:
                    _cache["articles"] = None
                return self._send_json({"ok": True, "id": source_id})

            return self._send_json({"error": "unsupported"}, status=400)
        except Exception as e:
            return self._send_json({"error": f"{type(e).__name__}: {str(e)[:200]}"}, status=500)

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _serve_articles(self, force: bool = False):
        now = time.time()
        with _cache_lock:
            fresh = (
                _cache["articles"] is not None
                and not force
                and (now - _cache["ts"] < CACHE_TTL_SEC)
            )
            if not fresh:
                arts, stat = fetch_all()
                _cache["articles"] = arts
                _cache["status"] = stat
                _cache["ts"] = now
            articles = _cache["articles"]
            status = _cache["status"]
            ts = _cache["ts"]

        self._send_json({
            "articles": articles,
            "count": len(articles),
            "fetchedAt": datetime.fromtimestamp(ts).isoformat(timespec="seconds") if ts else None,
            "cacheTTL": CACHE_TTL_SEC,
            "sourceStatus": status,
            "llm": status.get("_llm", { "enabled": bool(ANTHROPIC_API_KEY), "model": LLM_MODEL if ANTHROPIC_API_KEY else None }),
        })

    def _serve_sources(self):
        with _cache_lock:
            status = dict(_cache["status"])
            ts = _cache["ts"]
        srcs = get_sources()
        self._send_json({
            "sources": [
                {**{k: v for k, v in s.items() if k != "custom"}, "status": status.get(s["id"], {"ok": None})}
                for s in srcs
            ],
            "presets": PRESET_SOURCES,
            "relevanceDomains": list(RELEVANCE.keys()),
            "seedKeywords": list(SEED_KEYWORDS.keys()),
            "hnTerms": HN_TERMS,
            "llm": status.get("_llm", { "enabled": bool(ANTHROPIC_API_KEY), "model": LLM_MODEL if ANTHROPIC_API_KEY else None }),
            "fetchedAt": datetime.fromtimestamp(ts).isoformat(timespec="seconds") if ts else None,
            "cacheTTL": CACHE_TTL_SEC,
            "categories": ["生活者トレンド", "市場統計", "海外/先進企業事例", "事業アイデア例"],
            "regions": ["国内", "海外"],
            "langs": ["JP", "EN"],
        })


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    os.chdir(BASE_DIR)
    print(f"SPROUT server on http://localhost:{PORT}")
    print(f"  static dir: {BASE_DIR}")
    print(f"  API: /api/articles, /api/sources  (force: /api/articles?refresh=1)")
    print(f"  cache: {CACHE_TTL_SEC}s")
    print(f"  sources: {len(SOURCES)} ({sum(1 for s in SOURCES if s['id'].startswith('gn_'))} Google News queries, 1 HN)")
    with ThreadedHTTPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")


if __name__ == "__main__":
    main()
