from __future__ import annotations

import argparse
import json
import math
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:  # pragma: no cover - helper script message only
    YouTubeTranscriptApi = None


ROOT = Path(__file__).resolve().parents[1]
AVAILABILITY = ROOT / "hengky-adinata-youtube-transcript-availability.md"
SUMMARY_OUT = ROOT / "hengky-adinata-video-summaries.md"
OUTLINE_OUT = ROOT / "hengky-adinata-timestamped-outlines.md"
ANALYSIS_OUT = ROOT / "hengky-adinata-combined-analysis.md"
STATUS_OUT = ROOT / "hengky-adinata-transcript-fetch-status.md"


STOPWORDS = set(
    """
    ada adalah agar akan aku anda apa atau awal bagian bahwa banyak baru bisa buat cara cukup dan dari
    dengan di dia dalam ini itu jadi jangan juga kalau kami kamu kan karena kata ke kembali kita lagi
    lah lalu lebih memang mereka nah nya oleh orang pada paling para perlu pernah punya saat sama
    sampai sangat saya sebuah sebagai sebenarnya sering seperti serta si soal sudah supaya tapi terus
    untuk utk ya yang
    aja banget bang bro can channel dulu dong emang full gw gue guys kadang kayak lo lu mah nih oh oke
    om part sih tuh udah
    gitu gitu. enggak nggak ngak gak gua gue gw lu lo ya ya. iya iya. kan kan. tuh nih sih dong lah
    heeh heeh. hmm hm hm. uh eh eee tertawa ketawa hahaha haha wkwk pak bu bro kak mas mbak mungkin
    misalnya cuman cuma tahu tau lihat liat bilang mau semua satu hari waktu sekarang gimana kenapa
    berarti terus sebenarnya sebenernya
    """
    .split()
)

TOPICS = {
    "smart money / market maker / bandar": [
        "smart money",
        "market maker",
        "bandar",
        "big fund",
        "big funds",
        "asing",
        "broker",
        "order book",
        "bid",
        "offer",
        "akumulasi",
        "distribusi",
        "buyer",
        "seller",
        "flow",
        "money flow",
        "kepentingan",
        "ritel",
        "tape reading",
        "buying power",
    ],
    "remora / mengikuti pemain besar": [
        "remora",
        "ikan",
        "hiu",
        "paus",
        "follow",
        "mengikuti",
        "ikut",
        "komunitas",
        "kelas",
        "founder",
        "murid",
        "mentor",
    ],
    "risk management / cut loss / all-in": [
        "risk",
        "risiko",
        "cut loss",
        "cutloss",
        "cl",
        "stop loss",
        "all in",
        "margin call",
        "loss",
        "rugi",
        "minus",
        "drawdown",
        "sizing",
        "position",
        "posisi",
        "batas",
        "modal",
    ],
    "portfolio recovery / market crash": [
        "porto",
        "portfolio",
        "recovery",
        "crash",
        "rungkad",
        "boncos",
        "berdarah",
        "turun",
        "rebound",
        "bangkit",
        "hancur",
        "msci",
        "ftse",
    ],
    "execution / timing trading": [
        "entry",
        "exit",
        "fast trade",
        "swing",
        "scalping",
        "scalwing",
        "momentum",
        "breakout",
        "support",
        "resistance",
        "looping",
        "timing",
        "hold",
        "jual",
        "beli",
        "serok",
    ],
    "saham / sektor / katalis": [
        "saham",
        "ihsg",
        "konglo",
        "ipo",
        "right issue",
        "bank",
        "emas",
        "batu bara",
        "crypto",
        "bitcoin",
        "sektor",
        "katalis",
        "emiten",
    ],
    "psikologi / mindset / disiplin": [
        "mental",
        "mindset",
        "sabar",
        "disiplin",
        "emosi",
        "nangis",
        "stress",
        "tekanan",
        "belajar",
        "gaya",
        "percaya",
        "takut",
        "trauma",
    ],
    "edukasi / metode / proses belajar": [
        "belajar",
        "metode",
        "rumus",
        "kelas",
        "mentor",
        "pemula",
        "edukasi",
        "framework",
        "strategi",
        "filosofi",
        "prinsip",
        "proses",
    ],
}

TERMS = [
    "IHSG",
    "MSCI",
    "FTSE",
    "IPO",
    "FCA",
    "RDN",
    "ARA",
    "ARB",
    "PANI",
    "BREN",
    "BRMS",
    "BUMI",
    "SINI",
    "WBSA",
    "CDIA",
    "DADA",
    "PSAT",
    "COIN",
    "TGUK",
    "IMPC",
    "RMKO",
    "PTRO",
    "KARW",
    "MERI",
    "BUVA",
    "BBCA",
    "BMRI",
    "BBSS",
    "SCMA",
    "INKP",
    "CTRA",
    "FILM",
    "MNCN",
    "WIKA",
    "KAEF",
    "SAME",
    "AGII",
    "AGRO",
    "BJBR",
    "MYOR",
    "RALS",
    "TRUE",
    "BIZYUGO",
    "HENAN",
    "MAYBANK",
    "SUCOR",
    "AJAIB",
    "MIRAE",
    "IDX",
]


class TimeoutSession(requests.Session):
    def __init__(self, timeout: int) -> None:
        super().__init__()
        self.timeout = timeout
        self.headers.update(
            {
                "user-agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
                ),
                "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        )

    def request(self, *args, **kwargs):
        kwargs.setdefault("timeout", self.timeout)
        return super().request(*args, **kwargs)


def video_id_from_url(url: str) -> str:
    parsed = urlparse(url)
    if "/shorts/" in parsed.path:
        return parsed.path.split("/shorts/", 1)[1].split("/")[0]
    return parse_qs(parsed.query).get("v", [""])[0]


def split_markdown_row(line: str) -> list[str]:
    cells: list[str] = []
    current = ""
    escaped = False
    for ch in line.strip().strip("|"):
        if ch == "|" and not escaped:
            cells.append(current.strip().replace("\\|", "|"))
            current = ""
        else:
            current += ch
        escaped = ch == "\\" and not escaped
        if ch != "\\":
            escaped = False
    cells.append(current.strip().replace("\\|", "|"))
    return cells


def parse_available(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    rows: list[dict[str, str]] = []
    in_available = False
    for line in text.splitlines():
        if line.startswith("## Transcript Tersedia"):
            in_available = True
            continue
        if in_available and line.startswith("## Tidak"):
            break
        if in_available and "| [YouTube](" in line:
            parts = split_markdown_row(line)
            if len(parts) < 4:
                continue
            match = re.search(r"\[YouTube\]\(([^)]+)\)", parts[3])
            if not match:
                continue
            url = match.group(1)
            rows.append({"title": parts[2], "url": url, "video_id": video_id_from_url(url)})
    return rows


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\n", " ")).strip()


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9][a-zA-Z0-9'._-]*", text.lower())


def top_phrases(text: str, limit: int = 8) -> list[str]:
    tokens = [t for t in tokenize(text) if len(t) > 2 and t not in STOPWORDS]
    counts: Counter[str] = Counter()
    for size in (1, 2, 3):
        for index in range(0, max(0, len(tokens) - size + 1)):
            words = tokens[index : index + size]
            if any(word in STOPWORDS for word in words):
                continue
            counts[" ".join(words)] += 1

    scored = []
    for phrase, count in counts.items():
        words = phrase.split()
        score = count * (1 + 0.55 * (len(words) - 1))
        if phrase in {"saham", "market", "trading", "hengky", "adinata", "remora"}:
            score *= 0.4
        scored.append((score, count, phrase))

    picked: list[str] = []
    for _score, count, phrase in sorted(scored, reverse=True):
        if count < 2 and len(picked) >= 4:
            continue
        key = phrase.replace(" ", "")
        if any(key in item.replace(" ", "") or item.replace(" ", "") in key for item in picked):
            continue
        picked.append(phrase)
        if len(picked) >= limit:
            break
    return picked


def count_topics(text: str) -> dict[str, dict[str, object]]:
    lower = text.lower()
    output = {}
    for topic, keys in TOPICS.items():
        score = 0
        hits = []
        for key in keys:
            count = lower.count(key.lower())
            if count:
                score += count
                hits.append(key)
        if score:
            output[topic] = {"score": score, "hits": hits[:8]}
    return dict(sorted(output.items(), key=lambda item: item[1]["score"], reverse=True))


def extract_terms(text: str) -> list[str]:
    upper = text.upper()
    return [term for term in TERMS if re.search(rf"\b{re.escape(term)}\b", upper)]


def fmt_time(seconds: float) -> str:
    value = int(seconds)
    hours = value // 3600
    minutes = (value % 3600) // 60
    secs = value % 60
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def segment_snippets(snippets: list[dict[str, object]], window: int) -> list[tuple[float, float, list[dict[str, object]]]]:
    buckets = []
    current: list[dict[str, object]] = []
    current_start = 0.0
    for snippet in snippets:
        start = float(snippet["start"])
        if not current:
            current_start = math.floor(start / window) * window
        if start >= current_start + window and current:
            buckets.append((current_start, current_start + window, current))
            current = []
            current_start = math.floor(start / window) * window
        current.append(snippet)
    if current:
        last_end = max(float(item["start"]) + float(item["duration"]) for item in current)
        buckets.append((current_start, last_end, current))
    return buckets


def outline_sentence(phrases: list[str], topics: dict[str, dict[str, object]], terms: list[str]) -> str:
    top_topic = next(iter(topics.keys()), "pembahasan umum")
    phrase_text = ", ".join(phrases[:4]) if phrases else "tema tidak dominan terbaca"
    term_text = f" Istilah/ticker terlihat: {', '.join(terms[:8])}." if terms else ""
    return f"Fokus pada {top_topic}; kata/frasa dominan: {phrase_text}.{term_text}"


def esc(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def fetch_with_library(video_id: str, session: TimeoutSession, languages: list[str]) -> tuple[str, list[dict[str, object]]]:
    if YouTubeTranscriptApi is None:
        raise RuntimeError("youtube-transcript-api belum terinstall")
    api = YouTubeTranscriptApi(http_client=session)
    transcript = api.fetch(video_id, languages=languages)
    return (
        getattr(transcript, "language_code", "-") or "-",
        [
            {"text": item.text, "start": float(item.start), "duration": float(item.duration)}
            for item in transcript
        ],
    )


def fetch_with_timedtext(video_id: str, session: TimeoutSession) -> tuple[str, list[dict[str, object]]]:
    page = session.get(f"https://www.youtube.com/watch?v={video_id}").text
    match = re.search(r'"captionTracks":(\[.*?\])\s*,\s*"audioTracks"', page)
    if not match:
        raise RuntimeError("captionTracks tidak ditemukan")
    tracks = json.loads(match.group(1).replace("\\u0026", "&"))
    if not tracks:
        raise RuntimeError("captionTracks kosong")
    track = next((item for item in tracks if item.get("languageCode") == "id"), tracks[0])
    response = session.get(track["baseUrl"] + "&fmt=json3")
    if response.status_code == 429:
        raise RuntimeError("timedtext HTTP 429")
    response.raise_for_status()
    data = response.json()
    snippets = []
    for event in data.get("events", []):
        parts = event.get("segs") or []
        text = clean_text(" ".join(part.get("utf8", "") for part in parts))
        if not text:
            continue
        snippets.append(
            {
                "text": text,
                "start": float(event.get("tStartMs", 0)) / 1000,
                "duration": float(event.get("dDurationMs", 0)) / 1000,
            }
        )
    if not snippets:
        raise RuntimeError("timedtext kosong")
    return track.get("languageCode", "-"), snippets


def fetch_transcript(video_id: str, session: TimeoutSession, languages: list[str]) -> tuple[str, list[dict[str, object]]]:
    errors = []
    for fetcher in (
        lambda: fetch_with_library(video_id, session, languages),
        lambda: fetch_with_timedtext(video_id, session),
    ):
        try:
            return fetcher()
        except Exception as exc:  # noqa: BLE001 - report all fetch failures
            errors.append(type(exc).__name__ if str(exc) == "" else f"{type(exc).__name__}: {exc}")
    raise RuntimeError("; ".join(errors))


def build_reports(video_reports: list[dict[str, object]]) -> None:
    all_text = " ".join(report["full_text"] for report in video_reports)
    all_topic_counts: Counter[str] = Counter()
    all_term_counts: Counter[str] = Counter()
    source_by_topic = defaultdict(list)
    source_by_term = defaultdict(list)

    for report in video_reports:
        for topic, data in report["topics"].items():
            all_topic_counts[topic] += int(data["score"])
            source_by_topic[topic].append((report["title"], report["url"], int(data["score"])))
        for term in report["terms"]:
            all_term_counts[term] += 1
            source_by_term[term].append((report["title"], report["url"]))

    lines = [
        "# Ringkasan Per Video YouTube Hengky Adinata",
        "",
        "Sumber: caption/transcript publik yang berhasil diakses otomatis.",
        "Isi di bawah adalah ringkasan dan ekstraksi topik, bukan transcript mentah.",
        "",
        f"Total video dianalisis: {len(video_reports)}",
        "",
    ]
    for number, report in enumerate(video_reports, 1):
        top_topics = list(report["topics"].items())[:5]
        lines.extend(
            [
                f"## {number}. {report['title']}",
                "",
                f"- Link: {report['url']}",
                f"- Bahasa transcript: {report['language']}",
                f"- Durasi terdeteksi: {fmt_time(float(report['duration']))}",
                f"- Jumlah segmen caption: {report['snippet_count']}",
                "",
                "### Ringkasan Detail",
                "",
            ]
        )
        if top_topics:
            topic_desc = "; ".join(
                f"{topic} ({data['score']} kemunculan kata kunci)" for topic, data in top_topics
            )
            lines.append(f"Video ini terutama membahas {topic_desc}.")
        else:
            lines.append("Transcript tidak memperlihatkan kategori dominan dari kamus topik yang dipakai.")
        if report["phrases"]:
            lines.append(f"Frasa dominan yang berulang: {', '.join(report['phrases'][:10])}.")
        if report["terms"]:
            lines.append(f"Istilah/ticker/institusi yang terdeteksi: {', '.join(report['terms'][:18])}.")
        lines.extend(["", "### Poin Utama Berbasis Transcript", ""])
        for topic, data in top_topics:
            lines.append(f"- {topic}: terlihat dari kemunculan kata/frasa seperti {', '.join(data['hits'][:6])}.")
        lines.extend(["", "### Alur Singkat", ""])
        for segment in report["segments"][:8]:
            lines.append(f"- {fmt_time(segment['start'])}-{fmt_time(segment['end'])}: {segment['outline']}")
        if len(report["segments"]) > 8:
            lines.append(f"- ...lihat file outline timestamped untuk {len(report['segments'])} segmen lengkap.")
        lines.append("")
    SUMMARY_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    lines = [
        "# Outline Timestamped YouTube Hengky Adinata",
        "",
        "Outline ini dibuat dari caption publik yang berhasil diakses. Setiap baris adalah ringkasan paraphrase per jendela waktu, bukan kutipan transcript verbatim.",
        "",
    ]
    for number, report in enumerate(video_reports, 1):
        lines.extend(
            [
                f"## {number}. {report['title']}",
                "",
                f"- Link: {report['url']}",
                f"- Durasi terdeteksi: {fmt_time(float(report['duration']))}",
                "",
                "| Timestamp | Outline | Frasa dominan | Istilah/ticker |",
                "|---|---|---|---|",
            ]
        )
        for segment in report["segments"]:
            lines.append(
                f"| {fmt_time(segment['start'])}-{fmt_time(segment['end'])} | "
                f"{esc(segment['outline'])} | "
                f"{esc(', '.join(segment['phrases'][:5]) or '-')} | "
                f"{esc(', '.join(segment['terms'][:10]) or '-')} |"
            )
        lines.append("")
    OUTLINE_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    lines = [
        "# Analisis Gabungan Transcript YouTube Hengky Adinata",
        "",
        "Analisis ini hanya memakai caption/transcript publik yang berhasil diakses otomatis. Tidak memakai asumsi eksternal tentang Hengky Adinata di luar teks video yang diproses.",
        "",
        "## Cakupan Data",
        "",
        f"- Video dengan transcript dianalisis: {len(video_reports)}",
        f"- Total segmen caption dianalisis: {sum(int(report['snippet_count']) for report in video_reports)}",
        f"- Total durasi terdeteksi: {sum(float(report['duration']) for report in video_reports) / 3600:.1f} jam",
        "",
        "## Tema Besar Yang Berulang",
        "",
    ]
    for topic, count in all_topic_counts.most_common():
        sources = sorted(source_by_topic[topic], key=lambda item: item[2], reverse=True)[:8]
        hit_examples = []
        for key in TOPICS[topic]:
            key_count = all_text.lower().count(key.lower())
            if key_count:
                hit_examples.append(f"{key} ({key_count})")
        lines.extend(
            [
                f"### {topic}",
                "",
                f"- Kekuatan kemunculan kata kunci: {count}",
                f"- Kata/frasa pemicu paling terlihat: {', '.join(hit_examples[:12])}.",
                "- Video sumber terkuat:",
            ]
        )
        for title, url, score in sources:
            lines.append(f"  - [{title}]({url}) - skor topik {score}")
        lines.append("")
    lines.extend(["## Frasa Dominan Lintas Video", ""])
    for phrase in top_phrases(all_text, 30):
        lines.append(f"- {phrase}")
    lines.extend(["", "## Istilah, Ticker, Dan Entitas Yang Sering Muncul", ""])
    for term, count in all_term_counts.most_common(40):
        examples = source_by_term[term][:5]
        source_text = "; ".join(f"[{title}]({url})" for title, url in examples)
        lines.append(f"- {term}: muncul di {count} video. Contoh sumber: {source_text}")
    lines.extend(
        [
            "",
            "## Sintesis Isi",
            "",
            "1. Poros terbesar transcript adalah pembacaan struktur pasar melalui pelaku besar, terutama market maker, bandar, order book, bid-offer, broker, asing, akumulasi, distribusi, dan money flow.",
            "2. Konsep Remora muncul sebagai metafora/metode mengikuti arus pemain besar, bukan sekadar indikator teknikal tunggal.",
            "3. Risk management dalam transcript banyak dikaitkan dengan cut loss, margin call, all-in, posisi, modal, rugi/minus, dan batas risiko.",
            "4. Pembahasan ticker/katalis terikat ke konteks arus dana dan perilaku pelaku pasar, bukan hanya daftar saham.",
            "5. Video juga memuat sisi psikologi trading: disiplin, sabar, mental, tekanan, trauma, gaya trading sendiri, dan proses belajar.",
            "",
            "## Batasan Analisis",
            "",
            "- Laporan ini berbasis caption otomatis/publik; kesalahan transkripsi dari YouTube dapat memengaruhi kata kunci.",
            "- Link yang tidak memiliki transcript publik atau terkena pembatasan IP tidak dianalisis isi videonya.",
            "- Outline timestamped bersifat paraphrase per segmen waktu dan sengaja tidak menyalin transcript lengkap.",
        ]
    )
    ANALYSIS_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="batasi jumlah video, 0 berarti semua")
    parser.add_argument("--delay", type=float, default=3.0, help="jeda antar video")
    parser.add_argument("--timeout", type=int, default=20, help="timeout HTTP per request")
    parser.add_argument("--languages", default="id,en", help="prioritas bahasa transcript")
    args = parser.parse_args()

    session = TimeoutSession(timeout=args.timeout)
    videos = parse_available(AVAILABILITY)
    if args.limit:
        videos = videos[: args.limit]

    reports = []
    errors = []
    languages = [item.strip() for item in args.languages.split(",") if item.strip()]
    for index, video in enumerate(videos, 1):
        print(f"{index}/{len(videos)} {video['video_id']} {video['title']}")
        try:
            language, snippets = fetch_transcript(video["video_id"], session, languages)
        except Exception as exc:  # noqa: BLE001 - status report
            message = f"{type(exc).__name__}: {exc}"
            print(f"  gagal: {message}")
            errors.append({**video, "error": message})
            time.sleep(args.delay)
            continue

        full_text = clean_text(" ".join(clean_text(str(item["text"])) for item in snippets))
        duration = max((float(item["start"]) + float(item["duration"]) for item in snippets), default=0)
        window = 300 if duration > 1800 else 180
        segments = []
        for start, end, bucket in segment_snippets(snippets, window=window):
            segment_text = clean_text(" ".join(clean_text(str(item["text"])) for item in bucket))
            segment_topics = count_topics(segment_text)
            segment_terms = extract_terms(segment_text)
            segment_phrases = top_phrases(segment_text, 6)
            segments.append(
                {
                    "start": start,
                    "end": end,
                    "topics": segment_topics,
                    "terms": segment_terms,
                    "phrases": segment_phrases,
                    "outline": outline_sentence(segment_phrases, segment_topics, segment_terms),
                }
            )

        reports.append(
            {
                **video,
                "language": language,
                "snippet_count": len(snippets),
                "duration": duration,
                "full_text": full_text,
                "topics": count_topics(full_text),
                "terms": extract_terms(full_text),
                "phrases": top_phrases(full_text, 12),
                "segments": segments,
            }
        )
        time.sleep(args.delay)

    if reports:
        build_reports(reports)

    lines = [
        "# Status Fetch Transcript YouTube Hengky Adinata",
        "",
        f"- Video dicoba: {len(videos)}",
        f"- Berhasil dianalisis: {len(reports)}",
        f"- Gagal: {len(errors)}",
        "",
    ]
    if errors:
        lines.extend(["## Error", "", "| Video | Link | Error |", "|---|---|---|"])
        for item in errors:
            lines.append(f"| {esc(item['title'])} | [YouTube]({item['url']}) | {esc(item['error'])} |")
    STATUS_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    return 0 if reports else 2


if __name__ == "__main__":
    raise SystemExit(main())
