# tools/build_engine.py
"""
أداة بناء ومزامنة والتحقق من سلامة محرك البوابة (engine/index.html)
تعمل مباشرة على مسارات مستودع darb-books الحالية دون الاعتماد على مسارات قديمة.
"""
import json
import os
import re
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_HTML_PATH = os.path.join(ROOT_DIR, 'engine', 'index.html')
CATALOG_JSON_PATH = os.path.join(ROOT_DIR, 'engine', 'editions', 'catalog.json')
EPIC_JSON_PATH = os.path.join(ROOT_DIR, 'engine', 'editions', 'epic-v1.json')

CATALOG_START = '// === BEGIN_EMBEDDED_CATALOG ==='
CATALOG_END = '// === END_EMBEDDED_CATALOG ==='
SPREADS_START = '// === BEGIN_EMBEDDED_EPIC_SPREADS ==='
SPREADS_END = '// === END_EMBEDDED_EPIC_SPREADS ==='


def replace_marked_block(html: str, start_marker: str, end_marker: str, new_body: str) -> str:
    pattern = re.compile(
        re.escape(start_marker) + r'.*?' + re.escape(end_marker),
        flags=re.DOTALL,
    )
    if not pattern.search(html):
        raise ValueError(f"Markers not found in engine/index.html: {start_marker} .. {end_marker}")
    replacement = f"{start_marker}\n{new_body}\n{end_marker}"
    return pattern.sub(lambda _: replacement, html, count=1)


def validate_engine_html(html: str) -> None:
    required_snippets = [
        'id="btnLibrary"',
        'id="libraryModal"',
        'id="cartoonModal"',
        'id="chapterVideo"',
        'playsinline',
        'id="celebrationModal"',
        'id="narratorAudioPlayer"',
        'function pauseNarrator()',
        "editions/catalog.json",
    ]
    forbidden_snippets = [
        'dist/story.html',
        'playPaperTurnSound',
        'playStoryChime',
        'speechSynthesis',
        'storyModalOverlay',
        'cartoonCanvas',
    ]

    missing = [s for s in required_snippets if s not in html]
    forbidden = [s for s in forbidden_snippets if s in html]

    if missing:
        raise AssertionError(f"Missing required snippets in engine/index.html: {missing}")
    if forbidden:
        raise AssertionError(f"Forbidden legacy snippets still present in engine/index.html: {forbidden}")


def main() -> int:
    for path in (ENGINE_HTML_PATH, CATALOG_JSON_PATH, EPIC_JSON_PATH):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Required file not found: {path}")

    with open(CATALOG_JSON_PATH, 'r', encoding='utf-8') as f:
        catalog_data = json.load(f)

    for edition in catalog_data.get('editions', []):
        data_file = os.path.join(ROOT_DIR, 'engine', edition['dataFile'])
        if not os.path.exists(data_file):
            raise FileNotFoundError(
                f"Edition '{edition.get('id')}' references missing dataFile: {data_file}"
            )

    with open(EPIC_JSON_PATH, 'r', encoding='utf-8') as f:
        epic_data = json.load(f)

    spreads = epic_data.get('spreads', [])
    if not spreads:
        raise ValueError("epic-v1.json contains no spreads")

    with open(ENGINE_HTML_PATH, 'r', encoding='utf-8') as f:
        html = f.read()

    catalog_js = 'const DEFAULT_CATALOG = ' + json.dumps(catalog_data, ensure_ascii=False, indent=2) + ';'
    spreads_js = (
        'const DEFAULT_EPIC_SPREADS = '
        + json.dumps(spreads, ensure_ascii=False, indent=2)
        + ';\nlet SPREADS = DEFAULT_EPIC_SPREADS.slice();'
    )

    html = replace_marked_block(html, CATALOG_START, CATALOG_END, catalog_js)
    html = replace_marked_block(html, SPREADS_START, SPREADS_END, spreads_js)

    validate_engine_html(html)

    with open(ENGINE_HTML_PATH, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)

    size_kb = os.path.getsize(ENGINE_HTML_PATH) / 1024
    print(
        f"✅ Synchronized and verified {ENGINE_HTML_PATH} "
        f"({size_kb:.1f} KB, {len(catalog_data.get('editions', []))} editions, {len(spreads)} epic spreads)"
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
