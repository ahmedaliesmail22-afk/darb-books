import type { BookBlock } from '@darb/book-schema';
import type {
  BlockCleanupFn,
  BlockMountContext,
  BlockPluginMetadata,
  InteractiveBlockPlugin,
} from './types';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectReadableStrings(value: unknown, limit = 16): string[] {
  const out: string[] = [];
  const visit = (node: unknown) => {
    if (out.length >= limit || node == null) return;
    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (trimmed.length >= 2 && !trimmed.startsWith('#') && !trimmed.startsWith('http')) {
        out.push(trimmed);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node === 'object') {
      for (const val of Object.values(node as Record<string, unknown>)) visit(val);
    }
  };
  visit(value);
  return out;
}

/**
 * سجل الكتل التفاعلية بنظام الإضافات (Interactive Block Registry):
 * يسمح بتسجيل مكونات تفاعلية مستقلة والتحقق من بياناتها بـ Zod وتنظيف مواردها
 * تلقائياً دون تعديل نواة المحرك.
 */
export class InteractiveBlockRegistry {
  private readonly plugins = new Map<string, InteractiveBlockPlugin<unknown>>();

  public register<TPayload>(plugin: InteractiveBlockPlugin<TPayload>): this {
    this.plugins.set(plugin.type, plugin as InteractiveBlockPlugin<unknown>);
    return this;
  }

  public unregister(type: string): boolean {
    return this.plugins.delete(type);
  }

  public has(type: string): boolean {
    return this.plugins.has(type);
  }

  public get(type: string): InteractiveBlockPlugin<unknown> | undefined {
    return this.plugins.get(type);
  }

  public list(): BlockPluginMetadata[] {
    return Array.from(this.plugins.values()).map((p) => ({
      type: p.type,
      labelAr: p.labelAr,
      descriptionAr: p.descriptionAr,
      icon: p.icon,
      examplePayload: p.examplePayload,
    }));
  }

  public validateBlock(
    block: BookBlock
  ):
    | { ok: true; plugin: InteractiveBlockPlugin<unknown>; payload: unknown }
    | { ok: false; code: 'UNKNOWN_BLOCK_TYPE' | 'INVALID_BLOCK_PAYLOAD'; message: string } {
    const plugin = this.plugins.get(block.type);
    if (!plugin) {
      return {
        ok: false,
        code: 'UNKNOWN_BLOCK_TYPE',
        message: `نوع الكتلة "${block.type}" غير مسجل في InteractiveBlockRegistry`,
      };
    }

    const parsed = plugin.schema.safeParse(block.payload ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return {
        ok: false,
        code: 'INVALID_BLOCK_PAYLOAD',
        message: `بيانات الكتلة "${plugin.labelAr}" غير صالحة${
          firstIssue ? `: ${firstIssue.path.join('.') || 'payload'} (${firstIssue.message})` : ''
        }`,
      };
    }

    return { ok: true, plugin, payload: parsed.data };
  }

  public extractSearchableText(block: BookBlock): string {
    const parts: string[] = [];
    if (block.title) parts.push(block.title);
    const plugin = this.plugins.get(block.type);
    if (plugin) {
      parts.push(plugin.labelAr);
      if (plugin.extractSearchText && block.payload) {
        const parsed = plugin.schema.safeParse(block.payload);
        if (parsed.success) {
          parts.push(plugin.extractSearchText(parsed.data));
          return parts.join(' ');
        }
      }
    }
    if (block.payload) {
      parts.push(...collectReadableStrings(block.payload));
    }
    return parts.join(' ');
  }

  public renderPlaceholderCard(block: BookBlock): string {
    const plugin = this.plugins.get(block.type);
    const icon = plugin?.icon ?? '🧩';
    const title = block.title || plugin?.labelAr || block.type;
    return `
      <div class="darb-block-card darb-block-placeholder">
        <div class="darb-block-head">
          <span class="darb-block-title">${icon} ${escapeHtml(title)}</span>
          <span class="darb-block-badge">${escapeHtml(plugin?.labelAr ?? block.type)}</span>
        </div>
      </div>
    `.trim();
  }

  public mountBlock(
    container: HTMLElement,
    block: BookBlock,
    ctxWithoutBlock: Omit<BlockMountContext, 'block'>
  ): BlockCleanupFn {
    const validation = this.validateBlock(block);
    container.innerHTML = '';

    if (!validation.ok) {
      const box = document.createElement('div');
      box.className = 'darb-block-card darb-block-error';
      box.innerHTML = `
        <div class="darb-block-head">
          <span class="darb-block-title">⚠️ ${escapeHtml(block.title || block.type)}</span>
          <span class="darb-block-badge">${escapeHtml(validation.code)}</span>
        </div>
        <p class="darb-block-error-msg">${escapeHtml(validation.message)}</p>
      `;
      container.appendChild(box);
      return () => {
        container.innerHTML = '';
      };
    }

    const { plugin, payload } = validation;
    const card = document.createElement('section');
    card.className = `darb-block-card darb-block-mode-${ctxWithoutBlock.mode} darb-block-type-${plugin.type}`;
    card.setAttribute('data-block-type', plugin.type);

    const head = document.createElement('header');
    head.className = 'darb-block-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'darb-block-title-wrap';
    titleWrap.innerHTML = `
      <span class="darb-block-title">${plugin.icon} ${escapeHtml(block.title || plugin.labelAr)}</span>
      <span class="darb-block-badge">${escapeHtml(plugin.labelAr)}</span>
    `;
    head.appendChild(titleWrap);

    if (ctxWithoutBlock.mode === 'inline' && block.fullscreenCapable !== false) {
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'darb-block-expand-btn';
      expandBtn.setAttribute('data-testid', `expandBlock-${plugin.type}`);
      expandBtn.textContent = '🔬 المختبر الكامل';
      expandBtn.title = 'فتح هذه الكتلة التفاعلية في وضع ملء الشاشة';
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        ctxWithoutBlock.onOpenFullscreen();
      });
      head.appendChild(expandBtn);
    }

    const body = document.createElement('div');
    body.className = 'darb-block-body';

    card.appendChild(head);
    card.appendChild(body);
    container.appendChild(card);

    const fullCtx: BlockMountContext = {
      ...ctxWithoutBlock,
      block,
    };

    let pluginCleanup: BlockCleanupFn | void;
    try {
      pluginCleanup =
        fullCtx.mode === 'fullscreen'
          ? plugin.mountFullscreen(body, payload, fullCtx)
          : plugin.mountInline(body, payload, fullCtx);
    } catch (err) {
      body.innerHTML = `<p class="darb-block-error-msg">تعذر تشغيل المكون التفاعلي: ${escapeHtml(
        err instanceof Error ? err.message : 'خطأ غير متوقع'
      )}</p>`;
    }

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      if (typeof pluginCleanup === 'function') {
        try {
          pluginCleanup();
        } catch {
          // ensure remaining blocks & page transition proceed safely
        }
      }
      container.innerHTML = '';
    };
  }
}
