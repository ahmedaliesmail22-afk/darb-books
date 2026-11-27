import { z } from 'zod';
import type { BlockCleanupFn, BlockMountContext, InteractiveBlockPlugin } from '../types';

export const CodeSandboxBlockPayloadSchema = z.object({
  language: z.enum(['javascript', 'html_css', 'algorithm_trace']).default('javascript'),
  starterCode: z.string().min(1),
  hintAr: z.string().optional(),
  expectedOutputContains: z.string().optional(),
  readOnly: z.boolean().default(false),
});

export type CodeSandboxBlockPayload = z.infer<typeof CodeSandboxBlockPayloadSchema>;

const SANDBOX_WORKER_HEADER = `
  const _logs = [];
  const console = {
    log: (...args) => _logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
    warn: (...args) => _logs.push('[WARN] ' + args.map(String).join(' ')),
    error: (...args) => _logs.push('[ERR] ' + args.map(String).join(' ')),
  };
  const fetch = () => { throw new Error('Network disabled in sandbox'); };
  const XMLHttpRequest = function() { throw new Error('XHR disabled in sandbox'); };
  const WebSocket = function() { throw new Error('WebSocket disabled in sandbox'); };
  const importScripts = () => { throw new Error('importScripts disabled'); };
  self.onmessage = (e) => {
    try {
      const fn = new Function('console', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', e.data.code);
      const ret = fn(console, fetch, XMLHttpRequest, WebSocket, importScripts);
      if (ret !== undefined) _logs.push('=> ' + (typeof ret === 'object' ? JSON.stringify(ret) : String(ret)));
      self.postMessage({ ok: true, logs: _logs });
    } catch (err) {
      self.postMessage({ ok: false, logs: _logs, error: String(err && err.message ? err.message : err) });
    }
  };
`;

function mountCodeSandbox(
  container: HTMLElement,
  payload: CodeSandboxBlockPayload,
  _ctx: BlockMountContext
): BlockCleanupFn {
  const controls = document.createElement('div');
  controls.className = 'darb-blk-row';

  const langTag = document.createElement('span');
  langTag.className = 'darb-block-badge';
  langTag.textContent = payload.language.toUpperCase();

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'darb-blk-btn active';
  runBtn.setAttribute('data-testid', 'codeSandboxRunBtn');
  runBtn.textContent = '▶ تشغيل آمن';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'darb-blk-btn';
  resetBtn.textContent = '🔄 استعادة';

  controls.append(langTag, runBtn, resetBtn);

  const editor = document.createElement('textarea');
  editor.className = 'darb-code-editor';
  editor.value = payload.starterCode;
  editor.readOnly = payload.readOnly;
  editor.spellcheck = false;

  const outputEl = document.createElement('pre');
  outputEl.className = 'darb-code-output';
  outputEl.setAttribute('data-testid', 'codeSandboxOutput');
  outputEl.textContent = payload.hintAr || 'اضغط "تشغيل آمن" لتنفيذ الشيفرة في البيئة المعزولة.';

  const iframePreview = document.createElement('iframe');
  iframePreview.className = 'darb-code-iframe';
  iframePreview.setAttribute('sandbox', 'allow-scripts');
  iframePreview.style.display = payload.language === 'html_css' ? 'block' : 'none';

  container.append(controls, editor);
  if (payload.language === 'html_css') {
    container.appendChild(iframePreview);
  } else {
    container.appendChild(outputEl);
  }

  let activeWorker: Worker | null = null;
  let activeBlobUrl: string | null = null;
  let activeTimer: number | null = null;

  const stopWorker = () => {
    if (activeTimer !== null) {
      window.clearTimeout(activeTimer);
      activeTimer = null;
    }
    if (activeWorker) {
      activeWorker.terminate();
      activeWorker = null;
    }
    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }
  };

  const runCode = () => {
    const code = editor.value;
    if (payload.language === 'html_css') {
      iframePreview.srcdoc = code;
      return;
    }

    stopWorker();
    outputEl.textContent = '⏳ جاري التشغيل في Worker معزول...';

    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') {
      outputEl.textContent = 'المتصفح الحالي لا يدعم Web Workers.';
      return;
    }

    const blob = new Blob([SANDBOX_WORKER_HEADER], { type: 'application/javascript' });
    activeBlobUrl = URL.createObjectURL(blob);
    activeWorker = new Worker(activeBlobUrl);

    activeTimer = window.setTimeout(() => {
      stopWorker();
      outputEl.textContent = '⏱️ تم إيقاف التنفيذ تلقائياً بعد تجاوز المهلة (1.5 ثانية).';
    }, 1500);

    activeWorker.onmessage = (ev: MessageEvent<{ ok: boolean; logs: string[]; error?: string }>) => {
      stopWorker();
      const lines = ev.data.logs ?? [];
      if (!ev.data.ok && ev.data.error) {
        lines.push(`Error: ${ev.data.error}`);
      }
      let resultText = lines.length > 0 ? lines.join('\n') : '(تم التنفيذ دون مخرجات)';
      if (
        payload.expectedOutputContains &&
        resultText.includes(payload.expectedOutputContains)
      ) {
        resultText += `\n✓ تحقق متوافق (${payload.expectedOutputContains})`;
      }
      outputEl.textContent = resultText;
    };

    activeWorker.onerror = (err) => {
      stopWorker();
      outputEl.textContent = `Worker Error: ${err.message}`;
    };

    activeWorker.postMessage({ code });
  };

  const onReset = () => {
    stopWorker();
    editor.value = payload.starterCode;
    outputEl.textContent = payload.hintAr || 'تمت استعادة الشيفرة المبدئية.';
    if (payload.language === 'html_css') iframePreview.srcdoc = payload.starterCode;
  };

  runBtn.addEventListener('click', runCode);
  resetBtn.addEventListener('click', onReset);

  if (payload.language === 'html_css') {
    iframePreview.srcdoc = payload.starterCode;
  }

  return () => {
    stopWorker();
    runBtn.removeEventListener('click', runCode);
    resetBtn.removeEventListener('click', onReset);
  };
}

export const codeSandboxPlugin: InteractiveBlockPlugin<CodeSandboxBlockPayload> = {
  type: 'code_sandbox',
  labelAr: 'محرر كود آمن',
  descriptionAr: 'تشغيل شيفرات برمجية داخل بيئة معزولة (Web Worker / Sandbox) مباشرة من صفحات الكتاب',
  icon: '💻',
  schema: CodeSandboxBlockPayloadSchema,
  examplePayload: {
    language: 'javascript',
    starterCode: `const items = [2, 4, 6, 8];\nconst sum = items.reduce((a, b) => a + b, 0);\nconsole.log('Sum =', sum);`,
    hintAr: 'جرّب تعديل المصفوفة ثم اضغط تشغيل آمن.',
    expectedOutputContains: 'Sum = 20',
    readOnly: false,
  },
  extractSearchText: (p) => `${p.language} ${p.hintAr ?? ''}`,
  mountInline: mountCodeSandbox,
  mountFullscreen: mountCodeSandbox,
};
