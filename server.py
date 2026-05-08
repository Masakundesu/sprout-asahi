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
import urllib.error
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


# -----------------------------------------------------------------------------
# Idea draft AI — field-by-field generation at executive-review quality
# -----------------------------------------------------------------------------

# Per-field quality criteria + character budgets. Used to build the prompt and
# also surfaced (lightly) to the frontend as placeholder hints.
FIELD_CRITERIA = {
    "problem": {
        "label": "Why now (構造変化と緊急性)",
        "chars": 180,
        "must_include": [
            "今、何が変わったか (構造変化を1つ特定)",
            "なぜ今やるべきか (待つコスト / 機会窓)",
            "数値シグナルを1つ (市場・行動・規制のいずれか)",
        ],
        "anti_pattern": "『〜が注目されている』『〜の可能性がある』のような曖昧な現状描写。",
    },
    "customer": {
        "label": "顧客と痛み (1人称JTBD)",
        "chars": 200,
        "must_include": [
            "1人のペルソナを具体化 (年齢/職業/世帯/可処分所得)",
            "そのペルソナが『〜の時に〜したい (が、〜だから出来ない)』のJTBD構文",
            "既存代替案 (現状どう代替しているか) と、その不満点1つ",
        ],
        "anti_pattern": "『健康志向の若者』のような塊概念。複数ペルソナの併記。",
    },
    "solution": {
        "label": "提供価値 / プロダクト",
        "chars": 200,
        "must_include": [
            "提供価値 (顧客便益) を1文で先に書く",
            "そのあとプロダクト構成 (何をどう届けるか)",
            "自社シーズと最低1つ接続させ、シーズコードを必ず引用",
        ],
        "anti_pattern": "機能の羅列から始める。便益と機能の混在。",
    },
    "unfairAdvantage": {
        "label": "自社シーズの効き (後発再現性)",
        "chars": 180,
        "must_include": [
            "後発が再現できない理由を3つ (蓄積年数/特許/データ/オペ等)",
            "シーズコードを必ず引用し、TRL/成熟度に触れる",
            "他社が真似ようとしたら何年かかるかを推定",
        ],
        "anti_pattern": "『独自技術』『コア競争力』のような名詞だけの抽象。",
    },
    "marketSize": {
        "label": "TAM / SAM / SOM (数値根拠付き)",
        "chars": 260,
        "must_include": [
            "TAM (全体市場) — 数値 + (出典: 〜) または (推定: 〜)",
            "SAM (当社が狙えるサブセット) — 数値 + 根拠",
            "SOM (3年で取りに行く) — 数値 + 計算式 (例: 単価×顧客数×頻度)",
        ],
        "anti_pattern": "TAM 1つだけ。出典なし。『大きい市場』のような形容。",
    },
    "goToMarket": {
        "label": "GTM (Phase × チャネル × 獲得KPI)",
        "chars": 240,
        "must_include": [
            "Phase 1〜3 の構造 (各Phaseは期間明示)",
            "各Phaseのチャネル + 獲得KPI (数値: 店舗数/顧客数/売上)",
            "Phase 1 で証明したい仮説を1つ",
        ],
        "anti_pattern": "『マーケティング強化』『SNS活用』のような汎用語。",
    },
    "businessModel": {
        "label": "ビジネスモデル / Unit Economics (LTV-CAC)",
        "chars": 220,
        "must_include": [
            "単価 × 頻度 × 原価 で月次/年次の貢献利益を計算",
            "LTV / CAC の想定値 + 回収期間 (月数)",
            "スケール時に効くレバー (固定費/変動費の構造)",
        ],
        "anti_pattern": "『高単価で高収益』のような定性記述。",
    },
    "competitors": {
        "label": "競合ポジショニング (2軸マップ)",
        "chars": 200,
        "must_include": [
            "ポジショニング軸を2つ明示 (例: 機能性 × 本格風味)",
            "主要競合 3社 を軸上に配置",
            "自社が取りに行くスポット (どの象限が空いているか)",
        ],
        "anti_pattern": "『差別化要素』を列挙するだけ。位置取りなし。",
    },
    "roadmap": {
        "label": "ロードマップ & 検証実験",
        "chars": 280,
        "must_include": [
            "Phase 毎にマイルストーン + 期間",
            "各 Phase で検証する仮説 + 成功指標 (数値)",
            "Kill criteria (これを下回ったら撤退する閾値)",
        ],
        "anti_pattern": "『〜を進める』『〜に取り組む』の連発。検証指標なし。",
    },
    "risks": {
        "label": "リスクと打ち手 (Mitigation)",
        "chars": 220,
        "must_include": [
            "上位 3 リスク (市場/技術/組織のうち2分類以上をカバー)",
            "各リスクに 影響度 (大/中/小) + 発生確率 (高/中/低)",
            "各リスクに 具体的な打ち手 (誰が何をいつまでに)",
        ],
        "anti_pattern": "リスクの列挙だけで打ち手がない。打ち手が『要検討』。",
    },
    "ask": {
        "label": "Ask (予算・人員・Go/No-Go ゲート)",
        "chars": 160,
        "must_include": [
            "予算 (億円) — 内訳を 2 区分以上 (R&D/マーケ/人件費 等)",
            "人員 (FTE と職種、社内転籍/外部採用の別)",
            "Go/No-Go ゲート (時期と判定基準)",
        ],
        "anti_pattern": "予算総額だけ。判定基準なし。",
    },
}


def _seed_block(seeds: list) -> str:
    """Format linked seeds for prompt inclusion."""
    if not seeds:
        return "(なし — 自社シーズとの接続が無いと採択は難しいため、必要なら接続を提案する)"
    lines = []
    for s in seeds[:6]:
        code = s.get("code") or s.get("id") or "?"
        name = s.get("name") or ""
        summary = (s.get("summary") or "").strip()
        readiness = s.get("readiness")
        category = s.get("category") or ""
        ip = s.get("ipStatus") or ""
        constraints = s.get("constraints") or []
        lines.append(
            f"- [{code}] {name} ({category}) — TRL/成熟度 {readiness}%\n"
            f"  概要: {summary}\n"
            f"  IP: {ip or '記載なし'}\n"
            f"  制約: {' / '.join(constraints) if constraints else '記載なし'}"
        )
    return "\n".join(lines)


def _article_block(articles: list) -> str:
    if not articles:
        return "(なし)"
    lines = []
    for a in articles[:5]:
        title = a.get("title") or ""
        source = a.get("source") or ""
        date = a.get("date") or ""
        summary = a.get("summary")
        if isinstance(summary, list):
            summary_txt = " / ".join(s for s in summary if s)
        else:
            summary_txt = str(summary or "")
        lines.append(f"- 「{title}」 ({source}, {date})\n  要点: {summary_txt[:400]}")
    return "\n".join(lines)


def _existing_block(existing: dict) -> str:
    if not existing:
        return "(まだ何も埋まっていない)"
    lines = []
    for k, v in existing.items():
        if not v:
            continue
        crit = FIELD_CRITERIA.get(k, {})
        label = crit.get("label", k)
        s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
        lines.append(f"- {label}: {s[:300]}")
    return "\n".join(lines) if lines else "(まだ何も埋まっていない)"


# Few-shot examples — 採択済みの "Air Beer" 案件 (CO2循環ビール) を使い、
# 各フィールドが「役員レビュー水準」とはどういうものかを LLM に教える。
# 他のアイデア (例: Sober Wellness) と内容がぶつからないよう、別案件で例示することで
# LLM が構造を学習し、コンテンツを丸コピしないように設計。
FEW_SHOT_EXAMPLES = {
    "problem": "EU CBAM が 2026 年 1 月から本格適用され、輸入飲料の炭素税負担が +12〜18% になる (出典: 欧州委員会 2025 年告示)。一方で Z 世代の 67% がカーボンニュートラル製品に支払い意欲を持つ (出典: Nielsen 2024)。既存ビール製造の発酵 CO2 を循環利用する技術は、関税回避とブランド価値の両立に必要であり、欧州主要 3 国の流通網が整う 2026 年内が立ち上げの最適タイミングである。",
    "customer": "ESG 調達基準を持つ欧州プレミアム外食チェーン (店舗数 200 以上、平均客単価 €60 超)。『サステナ認証付き飲料を仕入れたいが、現行サプライヤーの値上げ圧力で取り扱い停止に追い込まれる』状況にある。既存代替案はオーガニックビール各社だが、製造段階の CO2 排出は削減できておらず、外食事業者からは『マーケ訴求が弱い』と評価される。",
    "solution": "ビール発酵で発生する CO2 を 95% 回収し同一製品に再注入する真の循環設計ビール。CO2-LOOP で大気放出ゼロを担保し、PAPER-PAK で容器を非 PET 化。プレミアム 350ml 缶 €4.20 (国内 ¥680) で外食 BtoB と限定小売を併走させる。",
    "unfairAdvantage": "CO2-LOOP は試運転 18 ヶ月の実プラント稼働実績があり TRL 78%、後発が同水準に達するには最短 6 年。PAPER-PAK は 2 社共同特許 (JP/EP) で外部ライセンス不可。発酵 CO2 回収率 95% は社内検証データで担保され、競合 Heineken の排出削減プログラム (削減率 30%) と桁が違う。",
    "marketSize": "TAM: 欧州プレミアム炭酸飲料 $14B + 日本サステナ・プレミアム飲料 $3B = $17B (出典: Statista 2028 予測)。SAM: ESG 認証取得・客単価 €40 以上の外食チャネル + 高感度小売 1,800 店舗で $4.2B (推定: TAM × チャネル捕捉率 25%)。SOM: 3 年で年間 GMV 50 億円 (店舗 800 × 月販 5,200 本 × 単価 €4.2)。",
    "goToMarket": "Phase 1 (〜2026 Q4): Tesco UK + REWE DE 計 200 店舗テスト、KPI = 月販 32 万本・カテゴリ ROI 18% で本格展開判定。Phase 2 (2027 H1): 欧州 3 国 + エアライン 2 社で 800 店舗、KPI = リピート率 35%・ロス率 8% 以下。Phase 3 (2027 Q4-): アジア展開 + CO2-LOOP 外販事業化、KPI = ライセンス収入 12 億円。",
    "businessModel": "本体販売: 単価 ¥680 × 月販 4,800 本 × 年 12 ヶ月 = 年 LTV (1 店舗) ¥3,916 万、原価率 41% で貢献利益 ¥2,310 万。CO2-LOOP 外販: ライセンス料 5,000 万円/社 × 想定 5 社 = 年 2.5 億円 (限界利益率 78%)。スケール時は外販事業の固定収入が主力ビール事業のヘッジに効き、為替・市況リスクを構造的に低減できる。",
    "competitors": "縦軸『製造段階の CO2 削減度』× 横軸『プレミアム価格訴求度』。Heineken は CO2 削減 30% で価格訴求は標準、Carlsberg Snap Pack は包装のみで価格は弱、Coca-Cola Plant Bottle は容器のみで製造変えず。当社は『削減 95% × プレミアム』の右上スポットが空白で、3 シーズの組合せで唯一占有可能。",
    "roadmap": "Phase 1 (2026 Q3-Q4): プロト試作 + 欧州小売 2 社で 200 店舗テスト。仮説『プレミアム単価でもカテゴリ ROI 18% を超える』。Kill: ROI 12% 未満なら撤退。Phase 2 (2027 H1): 欧州本格ローンチ + 機内食採用。仮説『リピート率 35%』。Kill: 22% 未満。Phase 3 (2027 Q4-): アジア展開 + CO2-LOOP 外販。仮説『ライセンス 5 社獲得』。",
    "risks": "①欧州 CBAM 認証取得遅延 (影響:大/確率:中 — 打ち手: 2026 Q1 までに第三者認証 ISO 14067 取得、薬事+認証専任 1 名配置)。②紙容器の冷蔵物流耐性 (影響:中/確率:高 — 打ち手: パッケージ強化 R&D を 2026 Q3 までに完了、DHL 欧州循環便で輸送試験)。③既存ビール容器ラインの稼働率影響 (影響:中/確率:中 — 打ち手: 別工場専用ラインで分離、既存事業の生産計画と切り離し)。",
    "ask": "予算 3.2 億円 (R&D 1.4 / 欧州マーケ 1.0 / 人件費 0.5 / 認証 0.3)。5.5 FTE (R&D 2 名社内転籍、欧州事業開発 2 名外部採用、薬事 0.5 名、CO2-LOOP 外販 1 名)。Go/No-Go: 2026 年 12 月末、Phase 1 月販 32 万本 + ROI 18% 以上を判定基準とする。",
}


def _draft_prompt(field: str, payload: dict) -> str:
    crit = FIELD_CRITERIA.get(field)
    if not crit:
        return ""
    title = (payload.get("title") or "(無題)").strip()
    codename = (payload.get("codename") or "").strip()
    seeds = payload.get("linkedSeeds") or []
    articles = payload.get("linkedArticles") or []
    existing = payload.get("existingFields") or {}

    must = "\n".join(f"  - {b}" for b in crit["must_include"])
    example = FEW_SHOT_EXAMPLES.get(field, "")

    return f"""あなたはアサヒグループホールディングス・新規事業推進室の上級戦略コンサルタント。
役員会 (社長 / CFO / CTO) に提出する事業提案書の「{crit['label']}」セクションを書く。
役員が読んで「これは投資判断できる」と感じる水準まで仕上げる。

# 参考例 — 別案件「Air Beer」(CO2 循環ビール、採択済) の同フィールドの良い回答

{example}

## なぜこれが良いか (構造を学ぶこと、内容は流用しないこと)
- 最初の一文で結論を断言している (PEEL の Point)
- 数値が出典または推定根拠とセットで書かれている
- シーズコード (CO2-LOOP / PAPER-PAK 等) を明示的に引用
- 抽象語に逃げず、具体的な動詞・固有名詞・数字で構成
- 必須要素を全て満たしている

# あなたが書く本案件のアイデア
タイトル: {title}{' (#' + codename + ')' if codename else ''}

# 引用された業界シグナル (記事 — 必ずこの記事の事実を最低 1 つ引用すること)
{_article_block(articles)}

# 接続された自社シーズ (アサヒの独自技術資産 — 必ずシーズコードを引用すること)
{_seed_block(seeds)}

# 既に埋まっている他セクション (整合させること、矛盾させないこと)
{_existing_block(existing)}

# 「{crit['label']}」の品質要件 (役員レビュー水準)
必須要素 (全て含めること):
{must}

避けるべきパターン:
  - {crit['anti_pattern']}
  - 上の参考例の文章を流用すること (構造だけ参考にし、内容は本案件用に書き起こすこと)

# 文体ルール (厳守)
- 結論先行 (PEEL: Point → Evidence → Example → Link)。最初の一文で結論を断言する。
- 数字を最低 1 つ含む。出典がある場合は「(出典: 〜)」、推定なら「(推定: 〜)」と明記。
- 禁則語: 「〜と思われる」「〜可能性がある」「〜かもしれない」「検討する」「推進する」「強化する」。判断不能なものは「未検証」と明記。
- 抽象語禁止: 「イノベーション」「シナジー」「差別化」「プラットフォーム」「ソリューション」は具体名詞に置換。
- 文体は断定の常体 (〜である / 〜する)。「ですます調」は使わない。
- 自社シーズが接続されている場合、最低 1 つはシーズコードを引用する。
- 引用された記事の事実 (数値・固有名詞) を最低 1 つ使う (記事がある場合)。
- 文字数: {crit['chars']}字以内 (これを超えたら必ず削る)。

# 出力フォーマット (JSON のみ、他のテキストは一切出力しない)
{{
  "draft": "初稿。要件を全て満たす日本語テキスト。",
  "critique": "役員 (CFO 視点) が突っ込みそうな弱点を 3 つ。各 1 行。",
  "final": "critique を反映して書き直した最終版。{crit['chars']}字以内。"
}}
"""


DRAFT_CRITIQUE_FALLBACK = {
    "problem": "①『24 ヶ月以内』の根拠が弱い — DCF 劣化の感度分析を添付すべき。 ②既存ビール DCF の前提となる為替・原材料推移シナリオが未明示。 ③構造変化の不可逆性 (リバウンド可能性) への言及が欠けている。",
    "customer": "①ペルソナ N=120 の代表性が弱い — 都市部 32 歳でも所得帯で行動が二分する可能性。 ②『パフォーマンスを落とせない』の定義が主観的。睡眠スコア等の客観指標で補強すべき。 ③既存代替案の不満が官能評価のみ。価格弾力性データも要確認。",
    "solution": "①3 シーズの組合せが本当に同時提供できるか、生産工程上の干渉リスクが未検証。 ②単価 480 円の根拠が弱い (競合との価格比較が必要)。 ③D2C と外食 BtoB のチャネル間カニバリ設計が未提示。",
    "unfairAdvantage": "①『再現に最低 8 年』の根拠が社内推定のみ — 第三者の特許 / TRL 評価で裏付け必要。 ②3 シーズ組合せの IP 保護戦略 (組合せ特許) の有無。 ③シーズ自体の社外ライセンス可能性、つまり競合が取得するリスクへの言及なし。",
    "marketSize": "①SAM のプレミアム比率 32% の出典が薄い — Euromonitor の追加レイヤーで裏取り必要。 ②SOM 計算式の年間購入回数 18 が楽観的、リテンション前提の検証が必要。 ③為替前提 ($1=¥) が固定で、感度分析が無い。",
    "goToMarket": "①Phase 1 のゼロプルーフバー 5 店舗で得られる学習が限定的 — 客層の代表性が弱い。 ②各 Phase 間の『移行判断基準』が KPI 達成だけで、ピボット選択肢が未提示。 ③CAC が Phase で変化する想定 (D2C → GMS) の数値根拠が薄い。",
    "businessModel": "①リピート率 40% の根拠が他社事例なしで楽観的。 ②原価率 38% にスケール時の物流費が含まれているか不明。 ③外食 BtoB 単価 8 万円/月の値決めロジック (店舗側の月販想定) が示されていない。",
    "competitors": "①2 軸の選定理由が薄い — 顧客が実際に意思決定で重視する軸かを購買データで裏取り必要。 ②各社の位置取りが定性評価。可能なら定量スコア (NPS / SOV) で示すべき。 ③新規参入 (大手 CPG の Sober Lifestyle ブランド立ち上げ) のリスクが未言及。",
    "roadmap": "①Kill criteria の閾値が単一指標 — 複合指標 (販売 + リピート + 粗利) で見るべき。 ②Phase 間の横並び比較不能 (各 Phase の指標が不揃い)。 ③Phase 3 のリスク (海外参入の規制) が未織込。",
    "risks": "①リスク 3 つで MECE が弱い — 為替・原材料・人材確保が抜け落ちている。 ②打ち手の所要工数 / コストが定量化されていない。 ③リスク発生時のセーフティネット (撤退時の損切り基準) が未提示。",
    "ask": "①予算配分の R&D 0.8 億円が他案件平均より低い — 機能性表示取得の実費が含まれているか要確認。 ②外食アライアンス担当の 1 名で欧州 + 国内をカバーするのは無理がある。 ③Go/No-Go の判定者と権限が不明 (役員何名以上の承認が必要か)。",
}


def _draft_fallback(field: str, payload: dict) -> str:
    """Local sample when API key is missing or call fails."""
    samples = {
        "problem": "GLP-1 普及で外食ビール客単価が前年比 -8% (出典: 帝国DB 2025)。一方ノンアル来店動機は同期間で +24% (出典: ぐるなび来店調査)。「飲む量×動機」の二重シフトは構造変化であり、既存ビール事業の DCF が 2027 年以降に劣化するため、24 ヶ月以内に新ブランドを立ち上げる必要がある。",
        "customer": "都市部 32 歳・年収 800 万円・週 3 で会食する管理職。『接待後にもう一杯欲しいが、翌朝のパフォーマンスを落とせない』時に、現状はノンアルビールで代替するが「子供っぽい / 体験が貧しい」と感じている。既存代替案は機能性ノンアルだが、官能評価が本格ビールに対して -1.2 点 (社内パネル N=120) で満足度が低い。",
        "solution": "「飲む時間を、自分の状態を上げる時間に変える」気分デザイン・プレミアムノンアル。REAL-ZERO で本格風味を担保し、Hop-β でリラックス機能性、LB-4012 で腸内コンディションを同時に提供する複合機能型。350ml 缶 480 円 / D2C サブスク 4,980 円月で、外食 BtoB と限定小売を併走させる。",
        "unfairAdvantage": "REAL-ZERO 由来の官能評価データ 20 年分 (社内パネル N=12,000 累積) は再現に最低 8 年要する。Hop-β は特許出願中 (JP 2024-XXXXXX) で機能性表示の根拠データを保有。LB-4012 は TRL 78%・パイロット生産実績あり。3 つの組合せ自体が国内外に存在せず、競合が同水準に達するまで推定 5-7 年。",
        "marketSize": "TAM: 国内ノンアル飲料 $2.5B + 海外ノンアル $28B = $30.5B (出典: Euromonitor 2030 予測)。SAM: プレミアム機能性ノンアル (単価 400 円以上 × 健康志向セグメント) で国内 $0.8B (推定: TAM × プレミアム比率 32%)。SOM: 3 年で国内 50 億円 GMV (単価 480 円 × 年間購入回数 18 × 顧客 580K)。",
        "goToMarket": "Phase 1 (〜2026 Q4): 都内ゼロプルーフバー 5 店舗で先行、KPI = 月間販売数 8,000 本・NPS 50 以上で仮説検証。Phase 2 (2027 H1): 高感度 CVS 200 店 + D2C で 2 万人会員、KPI = リピート率 40%・LTV 18,000 円。Phase 3 (2027 H2-): GMS 1,500 店 + 欧米テスト、KPI = GMV 50 億円。",
        "businessModel": "単価 480 円 × 月間購入 6 本 × 12 ヶ月 = 年間 LTV 34,560 円、原価率 38% で貢献利益 21,427 円。CAC は D2C 想定で 8,000 円、回収期間 4.5 ヶ月。スケール時は外食 BtoB の固定単価 (1 店舗 8 万円/月) が損益分岐の安定剤として効き、小売チャネルの値引き耐性を確保できる。",
        "competitors": "ポジショニング軸: 縦軸『機能性の強度』× 横軸『風味の本格度』。Athletic Brewing は本格度高だが機能性は弱い、Recess は機能性高だが風味が水様、Kin Euphorics はライフスタイル軸でアルコール代替の文脈。当社は『本格度高 × 機能性高』の右上スポットが空白で、3 シーズの組み合わせで唯一占有可能。",
        "roadmap": "Phase 1 (2026 Q3-Q4): プロト 5 SKU 試作、外食 5 店舗テスト。仮説『プレミアム単価でも月 8,000 本売れる』。Kill criteria: 月販 4,000 本未満なら撤退。Phase 2 (2027 H1): D2C ローンチ、機能性表示取得。仮説『リピート率 40% を達成』。Kill: リピート 25% 未満。Phase 3 (2027 H2): GMS 拡大。仮説『年間 GMV 50 億円』。",
        "risks": "①機能性表示取得遅延 (影響:大 / 確率:中 — 打ち手: 申請を 2026 Q1 に前倒し、薬事担当 1 名専任配置)。②既存ビール事業とのカニバリ (影響:中 / 確率:高 — 打ち手: 別ブランド・別法人スキームで意思決定を独立化、6 ヶ月後にカニバリ率を測定)。③プレミアム単価の受容性 (影響:大 / 確率:中 — 打ち手: Phase 1 でゼロプルーフバー先行検証、価格弾力性データを取得)。",
        "ask": "予算 1.8 億円 (R&D 0.8 / マーケ 0.6 / 人件費 0.4)。人員 4.5 FTE (R&D 2 名社内転籍、ブランド 1 名外部採用、薬事 0.5 名、外食アライアンス 1 名)。Go/No-Go ゲート: 2026 年 12 月末、Phase 1 月販 8,000 本 + NPS 50 以上を判定基準とする。",
    }
    return samples.get(field, "")


def llm_draft(field: str, payload: dict) -> dict:
    """Call Claude to draft an exec-quality section. Returns dict with 'final' + metadata."""
    crit = FIELD_CRITERIA.get(field)
    if not crit:
        return {"ok": False, "reason": "unknown_field", "field": field}

    if not ANTHROPIC_API_KEY:
        return {
            "ok": False, "reason": "no_api_key", "field": field,
            "final": _draft_fallback(field, payload),
            "critique": DRAFT_CRITIQUE_FALLBACK.get(field, ""),
            "model": None,
        }

    body = {
        "model": LLM_MODEL,
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": _draft_prompt(field, payload)}],
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
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", errors="replace")[:1000]
        except Exception:
            pass
        print(f"[draft] fail for field='{field}': HTTP {e.code} {e.reason} | model={LLM_MODEL} | body={err_body}", file=sys.stderr)
        return {
            "ok": False, "reason": f"api_error: HTTP {e.code}", "field": field,
            "final": _draft_fallback(field, payload),
            "critique": DRAFT_CRITIQUE_FALLBACK.get(field, ""),
            "model": LLM_MODEL,
            "debug": err_body[:500],
        }
    except Exception as e:
        print(f"[draft] fail for field='{field}': {type(e).__name__}: {e}", file=sys.stderr)
        return {
            "ok": False, "reason": f"api_error: {type(e).__name__}", "field": field,
            "final": _draft_fallback(field, payload),
            "critique": DRAFT_CRITIQUE_FALLBACK.get(field, ""),
            "model": LLM_MODEL,
        }

    txt = "".join(blk.get("text", "") for blk in data.get("content", []) if blk.get("type") == "text").strip()
    # Best-effort JSON extraction
    m = re.search(r"\{.*\}", txt, re.DOTALL)
    parsed = None
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = None
    final = (parsed or {}).get("final") or (parsed or {}).get("draft") or txt
    return {
        "ok": True, "field": field,
        "final": (final or "").strip(),
        "draft": (parsed or {}).get("draft", ""),
        "critique": (parsed or {}).get("critique", ""),
        "model": LLM_MODEL,
    }


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
        if self.path.startswith("/api/draft/criteria"):
            # Lightweight read of field labels + char limits + must_include for the editor
            slim = {k: {"label": v["label"], "chars": v["chars"], "must_include": v["must_include"]}
                    for k, v in FIELD_CRITERIA.items()}
            self._send_json({"fields": slim, "llmEnabled": bool(ANTHROPIC_API_KEY), "model": LLM_MODEL if ANTHROPIC_API_KEY else None})
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/sources"):
            self._mutate_source("POST")
            return
        if self.path.startswith("/api/draft"):
            self._serve_draft()
            return
        self.send_response(405); self.end_headers()

    def _serve_draft(self):
        body = self._read_json_body()
        field = (body.get("field") or "").strip()
        if field not in FIELD_CRITERIA:
            return self._send_json({"error": "unknown field"}, status=400)
        result = llm_draft(field, body)
        return self._send_json(result, status=200 if result.get("final") else 500)

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
