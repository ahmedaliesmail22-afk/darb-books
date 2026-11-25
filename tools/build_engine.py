# tools/build_engine.py
import os, re

with open('dist/story.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Update Title
html = re.sub(
    r'<title>.*?</title>',
    '<title>بوابة درب — المحرك التفاعلي ثلاثي الأبعاد للكتب والروايات</title>',
    html
)

# 2. In topbar: Replace btnSound with btnLibrary
html = html.replace(
    '<button class="topbar-btn" id="btnSound" title="صوت تقليب الورق">🔊</button>',
    '<button class="topbar-btn" id="btnLibrary" title="مكتبة الأجزاء والإصدارات">📚 المكتبة</button>'
)

# 3. Add CSS for Library, Video Modals, and Celebration Modal
additional_css = """
/* ==========================================================================
   📚 Library, Video, & Celebration Modal Styles
   ========================================================================== */
.library-card {
  max-width: 640px !important;
  max-height: 85vh;
  overflow-y: auto;
}
.library-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 15px;
}
.edition-card {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(212, 175, 55, 0.3);
  border-radius: 14px;
  padding: 18px 20px;
  transition: all 0.25s ease;
  cursor: pointer;
  text-align: right;
  position: relative;
}
.edition-card:hover {
  border-color: #d4af37;
  transform: translateY(-2px);
  background: rgba(30, 41, 59, 0.95);
  box-shadow: 0 8px 24px rgba(212, 175, 55, 0.15);
}
.edition-card.active {
  border-color: #f59e0b;
  background: rgba(45, 33, 15, 0.85);
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.25);
}
.edition-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: bold;
  margin-bottom: 8px;
}
.edition-title {
  font-size: 1.15rem;
  font-weight: bold;
  color: #ffea9f;
  margin: 0 0 6px;
}
.edition-desc {
  font-size: 0.85rem;
  color: #cbd5e1;
  line-height: 1.5;
  margin: 0 0 12px;
}
.edition-meta {
  display: flex;
  gap: 16px;
  font-size: 0.78rem;
  color: #94a3b8;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  padding-top: 8px;
}
.edition-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Video Modal */
.video-card {
  max-width: 820px !important;
  width: 95% !important;
  padding: 16px !important;
  background: #0b0f19 !important;
  border: 1px solid rgba(212, 175, 55, 0.4) !important;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85) !important;
}
.video-wrapper {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  aspect-ratio: 16 / 9;
}
.video-wrapper video {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

/* Celebration Modal */
.celebration-card {
  max-width: 480px !important;
  text-align: center;
  padding: 35px 25px !important;
  background: radial-gradient(circle at center, #1e293b 0%, #0b0f19 100%) !important;
  border: 2px solid #d4af37 !important;
  box-shadow: 0 0 50px rgba(212, 175, 55, 0.35) !important;
}
.celebration-badge {
  font-size: 4rem;
  margin-bottom: 12px;
  animation: bounce 1s infinite alternate;
}
@keyframes bounce {
  from { transform: translateY(0); }
  to { transform: translateY(-8px); }
}
.celebration-card h2 {
  color: #f59e0b;
  font-size: 1.5rem;
  margin-bottom: 10px;
}
.celebration-card p {
  color: #cbd5e1;
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 25px;
}
.celebration-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.celebration-btn {
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: bold;
  cursor: pointer;
  border: 1px solid rgba(212, 175, 55, 0.5);
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  transition: all 0.2s;
}
.celebration-btn:hover {
  background: rgba(212, 175, 55, 0.2);
  border-color: #d4af37;
}
.celebration-btn.primary {
  background: linear-gradient(135deg, #d4af37, #f59e0b);
  color: #0b0f19;
  border: none;
}
.celebration-btn.primary:hover {
  opacity: 0.9;
  transform: scale(1.03);
}
"""

html = html.replace('</style>', additional_css + '\n</style>')

# 4. Replace Cartoon Modal HTML with Video Modal HTML + Library Modal + Celebration Modal
old_cartoon_modal_regex = r'<div class="cartoon-modal-overlay" id="cartoonModal".*?</div>\s*</div>\s*</div>'
new_modals_html = """
  <!-- 🎬 نافذة عرض ملخص كواليس الفصل (فيديو عالي الدقة بصوت مدمج) -->
  <div class="cartoon-modal-overlay" id="cartoonModal" style="display:none;">
    <div class="modal-card video-card">
      <div class="cartoon-header">
        <h3 id="cartoonModalTitle" style="color:#f59e0b; font-size:1.15rem; margin:0;">كواليس الفصل</h3>
        <button class="cartoon-close-btn" id="btnCartoonClose">&times;</button>
      </div>
      <div class="video-wrapper">
        <video id="chapterVideo" controls playsinline preload="metadata"></video>
      </div>
    </div>
  </div>

  <!-- 📚 نافذة مكتبة الأجزاء والإصدارات -->
  <div class="cartoon-modal-overlay" id="libraryModal" style="display:none;">
    <div class="modal-card library-card">
      <div class="cartoon-header">
        <h3 style="color:#f59e0b; font-size:1.2rem; margin:0;">📚 مكتبة أجزاء وروايات منظومة درب</h3>
        <button class="cartoon-close-btn" id="btnLibraryClose">&times;</button>
      </div>
      <p style="color:#94a3b8; font-size:0.88rem; margin:10px 0 15px;">اختر الجزء أو الإصدار لقراءته وسماع روايته الصوتية:</p>
      <div id="libraryList" class="library-grid"></div>
    </div>
  </div>

  <!-- 🏆 نافذة إتمام الرواية الاحتفالية (الغلاف الخلفي) -->
  <div class="cartoon-modal-overlay" id="celebrationModal" style="display:none;">
    <div class="modal-card celebration-card">
      <div class="celebration-badge">🏆</div>
      <h2>«اكتملت الرواية بحمد الله»</h2>
      <p>لقد أتممت قراءة واستماع ملحمة درب التقنية الكاملة.. من شرارة الفكرة الأولى وحتى معانقة السحاب.</p>
      <div class="celebration-actions">
        <button class="celebration-btn" id="btnRestartBook">🔄 العودة للبداية</button>
        <button class="celebration-btn primary" id="btnOpenLibraryFromCelebration">📚 تصفح الأجزاء</button>
      </div>
    </div>
  </div>
"""

html = re.sub(old_cartoon_modal_regex, new_modals_html, html, flags=re.DOTALL)

# 5. Replace Synthetic Audio Block Cleanly with Dummy Functions
synth_audio_pattern = r'// =============================================================================\s*// المحرك الصوتي الاصطناعي لحفيف الورق ونغمات القصص\s*// =============================================================================.*?function renderPageContent'
synth_replacement = """// =============================================================================
// المحرك الصوتي المطور (تم استبدال الصوت الاصطناعي بالصوتيات المدمجة الحقيقية)
// =============================================================================
function playPaperTurnSound() {}
function playStoryChime() {}

function renderPageContent"""
html = re.sub(synth_audio_pattern, synth_replacement, html, flags=re.DOTALL)

# 6. Update Audio Directory and Timing in JS
html = html.replace("'audio/spread_'", "currentAudioDir + 'spread_'")
html = html.replace('"audio/spread_"', "currentAudioDir + 'spread_'")

# Shorten auto-flip timeout after audio ends to 100ms
html = html.replace('setTimeout(() => { if (isNarrating) nextPage(); }, 600);', 'setTimeout(() => { if (isNarrating) nextPage(); }, 100);')
html = html.replace('setTimeout(() => { if (isNarrating) nextPage(); }, 500);', 'setTimeout(() => { if (isNarrating) nextPage(); }, 100);')

# On back-cover audio end: trigger showCelebrationModal
html = html.replace(
    "stopNarrator();",
    "stopNarrator(); if (currentSpreadIndex >= SPREADS.length - 1) showCelebrationModal();"
)

# 7. Add Library, Video, Dynamic Edition JS at end of script
engine_js = """
// =============================================================================
// 🏛️ محرك الأجزاء المتعددة والمكتبة التفاعلية (Multi-Edition & Video Engine)
// =============================================================================
let currentEditionId = 'epic-v1';
let currentAudioDir = '../audio/epic-v1/';
let currentVideoDir = '../videos/epic-v1/';
let catalogData = null;

// قراءة معرّف الإصدار من رابط الصفحة ?edition=...
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('edition')) {
  currentEditionId = urlParams.get('edition');
  currentAudioDir = `../audio/${currentEditionId}/`;
  currentVideoDir = `../videos/${currentEditionId}/`;
}

// عناصر واجهة المكتبة والفيديو والاحتفال
const btnLibraryEl = document.getElementById('btnLibrary');
const libraryModalEl = document.getElementById('libraryModal');
const btnLibraryCloseEl = document.getElementById('btnLibraryClose');
const libraryListEl = document.getElementById('libraryList');

const cartoonModalEl = document.getElementById('cartoonModal');
const cartoonModalTitleEl = document.getElementById('cartoonModalTitle');
const btnCartoonCloseEl = document.getElementById('btnCartoonClose');
const chapterVideoEl = document.getElementById('chapterVideo');

const celebrationModalEl = document.getElementById('celebrationModal');
const btnRestartBookEl = document.getElementById('btnRestartBook');
const btnOpenLibraryFromCelebrationEl = document.getElementById('btnOpenLibraryFromCelebration');

// تحميل بيانات كتالوج المكتبة
async function loadLibraryCatalog() {
  try {
    const res = await fetch('editions/catalog.json');
    if (res.ok) {
      catalogData = await res.json();
      renderLibraryUI();
    }
  } catch (err) {
    console.warn('Could not load catalog.json dynamically:', err);
  }
}

function renderLibraryUI() {
  if (!catalogData || !catalogData.editions || !libraryListEl) return;
  libraryListEl.innerHTML = '';
  
  catalogData.editions.forEach(ed => {
    const isCurrent = (ed.id === currentEditionId);
    const card = document.createElement('div');
    card.className = `edition-card ${isCurrent ? 'active' : ''}`;
    card.innerHTML = `
      <div class="edition-badge" style="background:${ed.badgeColor || '#f59e0b'}; color:#0b0f19;">${ed.badge}</div>
      <div class="edition-title">${ed.title}</div>
      <div class="edition-desc">${ed.description}</div>
      <div class="edition-meta">
        <span>📖 ${ed.spreadsCount || 27} نشرة</span>
        <span>🎧 ${ed.audioTracksCount || 27} تراكاً صوتياً</span>
        <span>🎬 ${ed.videosCount || 7} فيديوهات كواليس</span>
        <span>📅 ${ed.releaseDate || '2026'}</span>
      </div>
    `;
    card.addEventListener('click', () => {
      if (ed.id !== currentEditionId) {
        window.location.search = `?edition=${ed.id}`;
      } else {
        libraryModalEl.style.display = 'none';
      }
    });
    libraryListEl.appendChild(card);
  });
}

if (btnLibraryEl) {
  btnLibraryEl.addEventListener('click', () => {
    libraryModalEl.style.display = 'flex';
    if (!catalogData) loadLibraryCatalog();
  });
}
if (btnLibraryCloseEl) {
  btnLibraryCloseEl.addEventListener('click', () => {
    libraryModalEl.style.display = 'none';
  });
}

// مشغل فيديو كواليس الفصول (الضغط المطول)
function openChapterVideo(chapterNum) {
  pauseNarrator();
  const titles = {
    1: 'كواليس الفصل الأول: نداء الاستغاثة ومخاض الفكرة',
    2: 'كواليس الفصل الثاني: المخطط الكبير وصدمة الجداول الـ 39',
    3: 'كواليس الفصل الثالث: معركة القيود المستحيلة وكيف قهرناها',
    4: 'كواليس الفصل الرابع: عثرات في المعمعة ولحظات الإنقاذ',
    5: 'كواليس الفصل الخامس: ولادة المحركات الكبرى',
    6: 'كواليس الفصل السادس: ملحمة التوثيق الأكبر',
    7: 'كواليس الفصل السابع: الإطلاق وملاقاة السحاب'
  };
  if (cartoonModalTitleEl) {
    cartoonModalTitleEl.textContent = titles[chapterNum] || `كواليس الفصل ${chapterNum}`;
  }
  if (chapterVideoEl) {
    chapterVideoEl.src = `${currentVideoDir}ch${chapterNum}.mp4`;
    chapterVideoEl.currentTime = 0;
    chapterVideoEl.play().catch(e => console.log('Autoplay blocked:', e));
  }
  cartoonModalEl.style.display = 'flex';
}

function closeChapterVideo() {
  if (chapterVideoEl) {
    chapterVideoEl.pause();
    chapterVideoEl.removeAttribute('src');
    chapterVideoEl.load();
  }
  cartoonModalEl.style.display = 'none';
}

if (btnCartoonCloseEl) {
  btnCartoonCloseEl.addEventListener('click', closeChapterVideo);
}

// ربط الضغط المطول والنقر على عناصر الفهرس
function setupChapterCards() {
  document.querySelectorAll('[data-chapter-id]').forEach(el => {
    const chId = parseInt(el.getAttribute('data-chapter-id'));
    let pressTimer = null;
    
    el.addEventListener('pointerdown', (e) => {
      pressTimer = setTimeout(() => {
        if ('vibrate' in navigator) navigator.vibrate(50);
        openChapterVideo(chId);
      }, 550);
    });
    
    el.addEventListener('pointerup', () => clearTimeout(pressTimer));
    el.addEventListener('pointerleave', () => clearTimeout(pressTimer));
    el.addEventListener('pointercancel', () => clearTimeout(pressTimer));
  });
}

// نافذة الاحتفال بإتمام الرواية
function showCelebrationModal() {
  stopNarrator();
  if (celebrationModalEl) celebrationModalEl.style.display = 'flex';
}

if (btnRestartBookEl) {
  btnRestartBookEl.addEventListener('click', () => {
    celebrationModalEl.style.display = 'none';
    goToSpread(0);
  });
}
if (btnOpenLibraryFromCelebrationEl) {
  btnOpenLibraryFromCelebrationEl.addEventListener('click', () => {
    celebrationModalEl.style.display = 'none';
    if (btnLibraryEl) btnLibraryEl.click();
  });
}

// استدعاء التهيئة
loadLibraryCatalog();
setTimeout(setupChapterCards, 600);
"""

# Replace openCartoonModal and canvas scenes in story.html with openChapterVideo
html = re.sub(r'function openCartoonModal\(chapterId\).*?function stopCartoonLoop\(\).*?\}\n', '', html, flags=re.DOTALL)
html = html.replace('openCartoonModal(chId)', 'openChapterVideo(chId)')

# Append engine_js right before </body>
html = html.replace('</body>', f'<script>\n{engine_js}\n</script>\n</body>')

# Write output to darb-books/engine/index.html
out_path = 'darb-books/engine/index.html'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Successfully generated {out_path}! Size: {os.path.getsize(out_path)} bytes")
