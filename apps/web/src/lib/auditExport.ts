import type { FormattedAuditEntry } from './arabicLabels';

export interface ExportFilePayload {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetter(indexZeroBased: number): string {
  let n = indexZeroBased + 1;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function makeDateStamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}_${hh}${mm}`;
}

/**
 * توليد ملف Excel حقيقي (.xlsx) بصيغة OOXML قياسية واتجاه RTL كامل.
 */
export async function exportAuditLogsToExcel(
  entries: FormattedAuditEntry[],
  options: { filterText?: string } = {}
): Promise<ExportFilePayload> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const exportedAt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  const rowsXml: string[] = [];
  const appendRow = (rowIndex: number, cells: Array<{ val: string; style: number }>, height?: number) => {
    const hAttr = height ? ` ht="${height}" customHeight="1"` : '';
    const cellsXml = cells
      .map((cell, colIdx) => {
        const ref = `${columnLetter(colIdx)}${rowIndex}`;
        return `<c r="${ref}" t="inlineStr" s="${cell.style}"><is><t xml:space="preserve">${escapeXml(cell.val)}</t></is></c>`;
      })
      .join('');
    rowsXml.push(`<row r="${rowIndex}"${hAttr}>${cellsXml}</row>`);
  };

  appendRow(
    1,
    [
      { val: 'منصة درب للكتب التفاعلية — تقرير سجل التدقيق', style: 1 },
      { val: `عدد السجلات: ${entries.length}`, style: 1 },
      { val: options.filterText ? `تصفية البحث: ${options.filterText}` : 'نطاق التصدير: السجل الحالي', style: 1 },
      { val: `تاريخ التصدير: ${exportedAt}`, style: 1 },
    ],
    28
  );

  appendRow(
    2,
    [
      { val: 'التوقيت', style: 2 },
      { val: 'الفاعل', style: 2 },
      { val: 'الإجراء', style: 2 },
      { val: 'الهدف', style: 2 },
      { val: 'التفاصيل', style: 2 },
      { val: 'البريد الإلكتروني', style: 2 },
      { val: 'عنوان الاتصال', style: 2 },
    ],
    26
  );

  entries.forEach((entry, idx) => {
    appendRow(
      idx + 3,
      [
        { val: entry.timestampText, style: 3 },
        { val: entry.actorName, style: 3 },
        { val: entry.actionAr, style: 3 },
        { val: entry.targetAr, style: 3 },
        { val: entry.detailsSentence, style: 3 },
        { val: entry.actorEmail, style: 3 },
        { val: entry.ipAddress, style: 3 },
      ],
      34
    );
  });

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0" rightToLeft="1" showGridLines="1"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="24"/>
  <cols>
    <col min="1" max="1" width="24" customWidth="1"/>
    <col min="2" max="2" width="24" customWidth="1"/>
    <col min="3" max="3" width="32" customWidth="1"/>
    <col min="4" max="4" width="34" customWidth="1"/>
    <col min="5" max="5" width="66" customWidth="1"/>
    <col min="6" max="6" width="28" customWidth="1"/>
    <col min="7" max="7" width="18" customWidth="1"/>
  </cols>
  <sheetData>
    ${rowsXml.join('\n    ')}
  </sheetData>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3E5AB"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center" readingOrder="2"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center" readingOrder="2"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center" wrapText="1" readingOrder="2"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="سجل التدقيق" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/styles.xml', stylesXml);
  zip.file('xl/worksheets/sheet1.xml', worksheetXml);

  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = await zip.generateAsync({ type: 'blob', mimeType });
  return {
    blob,
    mimeType,
    fileName: `darb-audit-logs-${makeDateStamp()}.xlsx`,
  };
}

function wrapRtlLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['-'];

  const lines: string[] = [];
  let current = '';

  const pushWordHard = (word: string) => {
    let chunk = '';
    for (const ch of word) {
      const next = chunk + ch;
      if (ctx.measureText(next).width > maxWidth && chunk.length > 0) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = next;
      }
    }
    if (chunk) current = chunk;
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = '';
      }
      if (ctx.measureText(word).width > maxWidth) {
        pushWordHard(word);
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['-'];
}

function dataUrlToJpegBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * تغليف صفحات JPEG عالية الدقة في مستند PDF 1.4 قياسي (مقاس A4 أفقي)
 * لضمان بقاء العربية متصلة بالتشكيل والاتجاه RTL في أي عارض PDF.
 */
function buildPdfFromJpegPages(pages: Array<{ width: number; height: number; jpeg: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let totalLength = 0;

  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr);
    totalLength += arr.length;
  };
  const pushText = (str: string) => {
    pushBytes(encoder.encode(str));
  };
  const startObj = (objNum: number) => {
    offsets[objNum] = totalLength;
    pushText(`${objNum} 0 obj\n`);
  };
  const endObj = () => {
    pushText('\nendobj\n');
  };

  pushText('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const pageWidthPt = 841.89;
  const pageHeightPt = 595.28;
  const pageObjNums: number[] = [];
  let nextObj = 3;

  const pageSpecs = pages.map((p) => {
    const pageObj = nextObj++;
    const contentObj = nextObj++;
    const imageObj = nextObj++;
    pageObjNums.push(pageObj);
    return { ...p, pageObj, contentObj, imageObj };
  });

  startObj(1);
  pushText('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  startObj(2);
  pushText(`<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`);
  endObj();

  for (const spec of pageSpecs) {
    const contentStream = `q\n${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);

    startObj(spec.pageObj);
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}] /Resources << /XObject << /Im0 ${spec.imageObj} 0 R >> >> /Contents ${spec.contentObj} 0 R >>`
    );
    endObj();

    startObj(spec.contentObj);
    pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushText('\nendstream');
    endObj();

    startObj(spec.imageObj);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${spec.width} /Height ${spec.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${spec.jpeg.length} >>\nstream\n`
    );
    pushBytes(spec.jpeg);
    pushText('\nendstream');
    endObj();
  }

  const xrefOffset = totalLength;
  const totalObjects = nextObj - 1;
  pushText(`xref\n0 ${totalObjects + 1}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i <= totalObjects; i += 1) {
    const off = offsets[i] ?? 0;
    pushText(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  pushText(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  const merged = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of chunks) {
    merged.set(chunk, cursor);
    cursor += chunk.length;
  }
  return new Blob([merged], { type: 'application/pdf' });
}

/**
 * تصدير سجل التدقيق إلى ملف PDF عربي سليم التشكيل والاتجاه (RTL)
 * بالرسم عبر خط المتصفح الحقيقي على Canvas 2D وتضمين الصفحات داخل PDF.
 */
export async function exportAuditLogsToPdf(
  entries: FormattedAuditEntry[],
  options: { filterText?: string } = {}
): Promise<ExportFilePayload> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const pageW = 1684;
  const pageH = 1191;
  const marginX = 56;
  const headerH = 145;
  const tableHeaderH = 48;
  const footerH = 48;
  const usableWidth = pageW - marginX * 2;
  const maxBodyY = pageH - footerH - 16;

  // عرض الأعمدة من اليمين إلى اليسار (التوقيت، الفاعل، الإجراء، الهدف، التفاصيل)
  const columns = [
    { title: 'التوقيت', width: 220 },
    { title: 'الفاعل', width: 200 },
    { title: 'الإجراء', width: 270 },
    { title: 'الهدف', width: 310 },
    { title: 'التفاصيل', width: usableWidth - (220 + 200 + 270 + 310) },
  ];

  const bodyFont = '600 17px "Cairo", "Tajawal", "Segoe UI", Tahoma, sans-serif';
  const headFont = '800 18px "Cairo", "Tajawal", "Segoe UI", Tahoma, sans-serif';
  const titleFont = '800 28px "Cairo", "Tajawal", "Segoe UI", Tahoma, sans-serif';
  const metaFont = '600 16px "Cairo", "Tajawal", "Segoe UI", Tahoma, sans-serif';

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 200;
  measureCanvas.height = 60;
  const mCtx = measureCanvas.getContext('2d')!;
  mCtx.font = bodyFont;
  mCtx.direction = 'rtl';

  const lineHeight = 26;
  const rowPadY = 12;
  const cellPadX = 12;

  const measuredRows = entries.map((entry) => {
    const rawTexts = [
      entry.timestampText,
      entry.actorName,
      entry.actionAr,
      entry.targetAr,
      entry.detailsSentence,
    ];
    const wrapped = rawTexts.map((txt, idx) =>
      wrapRtlLines(mCtx, txt, columns[idx]!.width - cellPadX * 2)
    );
    const maxLines = Math.max(...wrapped.map((w) => w.length), 1);
    const rowH = Math.max(46, maxLines * lineHeight + rowPadY * 2);
    return { wrapped, rowH };
  });

  if (measuredRows.length === 0) {
    measuredRows.push({
      wrapped: [['-', '-', 'لا توجد سجلات', '-', 'لا توجد أحداث مطابقة لمرشح البحث الحالي.']],
      rowH: 60,
    });
  }

  // تقسيم الصفوف إلى صفحات A4 أفقية
  const pageChunks: Array<typeof measuredRows> = [];
  let currentChunk: typeof measuredRows = [];
  let yCursor = headerH + tableHeaderH;

  for (const row of measuredRows) {
    if (yCursor + row.rowH > maxBodyY && currentChunk.length > 0) {
      pageChunks.push(currentChunk);
      currentChunk = [row];
      yCursor = headerH + tableHeaderH + row.rowH;
    } else {
      currentChunk.push(row);
      yCursor += row.rowH;
    }
  }
  if (currentChunk.length > 0) pageChunks.push(currentChunk);

  const exportedAt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  const renderedPages: Array<{ width: number; height: number; jpeg: Uint8Array }> = [];

  pageChunks.forEach((rows, pageIdx) => {
    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d')!;
    ctx.direction = 'rtl';

    // خلفية بيضاء للطباعة والقراءة الواضحة
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageW, pageH);

    // ترويسة الصفحة العليا
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, pageW, 118);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(0, 114, pageW, 5);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f8df7a';
    ctx.font = titleFont;
    ctx.fillText('منصة درب للكتب التفاعلية — تقرير سجل التدقيق الأمني والإداري', pageW - marginX, 24);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = metaFont;
    const subMeta = options.filterText
      ? `تاريخ التصدير: ${exportedAt}  |  عدد السجلات: ${entries.length}  |  تصفية البحث: ${options.filterText}`
      : `تاريخ التصدير: ${exportedAt}  |  إجمالي السجلات المصدّرة: ${entries.length}`;
    ctx.fillText(subMeta, pageW - marginX, 74);

    // ترويسة جدول الأعمدة
    const headY = headerH;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(marginX, headY, usableWidth, tableHeaderH);

    ctx.font = headFont;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    let colRightX = pageW - marginX;
    for (const col of columns) {
      ctx.fillText(col.title, colRightX - cellPadX, headY + tableHeaderH / 2);
      colRightX -= col.width;
      if (colRightX > marginX) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(colRightX, headY);
        ctx.lineTo(colRightX, headY + tableHeaderH);
        ctx.stroke();
      }
    }

    // رسم صفوف البيانات
    let rowY = headY + tableHeaderH;
    ctx.textBaseline = 'top';
    rows.forEach((row, rIdx) => {
      ctx.fillStyle = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(marginX, rowY, usableWidth, row.rowH);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(marginX, rowY, usableWidth, row.rowH);

      ctx.font = bodyFont;
      ctx.fillStyle = '#0f172a';
      let xRight = pageW - marginX;
      columns.forEach((col, cIdx) => {
        const lines = row.wrapped[cIdx] ?? ['-'];
        lines.forEach((ln, lIdx) => {
          ctx.fillText(ln, xRight - cellPadX, rowY + rowPadY + lIdx * lineHeight);
        });
        xRight -= col.width;
        if (xRight > marginX) {
          ctx.strokeStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(xRight, rowY);
          ctx.lineTo(xRight, rowY + row.rowH);
          ctx.stroke();
        }
      });

      rowY += row.rowH;
    });

    // تذييل رقم الصفحة
    ctx.fillStyle = '#475569';
    ctx.font = metaFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`صفحة ${pageIdx + 1} من ${pageChunks.length}`, pageW / 2, pageH - 24);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    renderedPages.push({
      width: pageW,
      height: pageH,
      jpeg: dataUrlToJpegBytes(dataUrl),
    });
  });

  const pdfBlob = buildPdfFromJpegPages(renderedPages);
  return {
    blob: pdfBlob,
    mimeType: 'application/pdf',
    fileName: `darb-audit-logs-${makeDateStamp()}.pdf`,
  };
}

export function triggerFileDownload(payload: ExportFilePayload): void {
  const url = URL.createObjectURL(payload.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = payload.fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export function canBrowserShareFiles(fileName: string, mimeType: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof File === 'undefined') return false;
  try {
    const probe = new File([''], fileName, { type: mimeType });
    return typeof navigator.canShare === 'function' ? navigator.canShare({ files: [probe] }) : true;
  } catch {
    return false;
  }
}

export async function shareOrDownloadExportFile(
  payload: ExportFilePayload,
  metadata: { title: string; text: string }
): Promise<'shared' | 'downloaded'> {
  // التنزيل المباشر تلقائياً لضمان حفظ نسخة لدى المستخدم، ثم فتح نافذة المشاركة عند دعمها
  triggerFileDownload(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    try {
      const file = new File([payload.blob], payload.fileName, { type: payload.mimeType });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: metadata.title,
          text: metadata.text,
          files: [file],
        });
        return 'shared';
      }
    } catch {
      // تم حفظ الملف محلياً تلقائياً عند إلغاء المشاركة أو عدم دعمها
    }
  }
  return 'downloaded';
}
