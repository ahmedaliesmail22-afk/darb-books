import { z } from 'zod';
import type { BlockCleanupFn, BlockMountContext, InteractiveBlockPlugin } from '../types';

const GeoLayerSchema = z.object({
  id: z.string().min(1),
  labelAr: z.string().min(1),
  color: z.string().default('#38bdf8'),
  visibleByDefault: z.boolean().default(true),
});

const GeoRouteSchema = z.object({
  id: z.string().min(1),
  labelAr: z.string().min(1),
  color: z.string().default('#f59e0b'),
  layerId: z.string().optional(),
  points: z.array(z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)])).min(2),
});

const GeoEventSchema = z.object({
  id: z.string().min(1),
  yearLabel: z.string().min(1),
  eraAr: z.string().optional(),
  titleAr: z.string().min(1),
  summaryAr: z.string().min(1),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  layerId: z.string().optional(),
});

export const GeoTimelineBlockPayloadSchema = z.object({
  mode: z.enum(['hybrid', 'map', 'timeline']).default('hybrid'),
  region: z.enum(['arab_world', 'world', 'hejaz', 'andalus', 'custom_grid']).default('arab_world'),
  mapTitleAr: z.string().optional(),
  layers: z.array(GeoLayerSchema).default([]),
  routes: z.array(GeoRouteSchema).default([]),
  events: z.array(GeoEventSchema).min(1),
});

export type GeoTimelineBlockPayload = z.infer<typeof GeoTimelineBlockPayloadSchema>;

function regionBasePaths(region: GeoTimelineBlockPayload['region']): string[] {
  switch (region) {
    case 'hejaz':
      return [
        'M20,10 Q45,35 55,65 T75,92 L92,92 L92,10 Z',
        'M8,18 Q25,52 15,88 L42,92 Q38,48 20,10 Z',
      ];
    case 'andalus':
      return [
        'M18,20 L68,18 L78,42 L58,68 L22,64 Z',
        'M20,76 L72,74 L74,90 L18,90 Z',
      ];
    case 'world':
      return [
        'M10,25 L28,22 L32,48 L22,78 L12,62 Z',
        'M42,20 L86,20 L92,55 L64,58 L54,82 L44,60 Z',
      ];
    case 'custom_grid':
      return ['M12,15 H88 V85 H12 Z'];
    case 'arab_world':
    default:
      return [
        'M10,36 L44,32 L52,55 L32,68 L12,56 Z',
        'M50,30 L76,34 L88,58 L64,74 L52,58 Z',
      ];
  }
}

function mountGeoTimeline(
  container: HTMLElement,
  payload: GeoTimelineBlockPayload,
  _ctx: BlockMountContext
): BlockCleanupFn {
  const activeLayers = new Set(
    payload.layers.filter((l) => l.visibleByDefault).map((l) => l.id)
  );
  let selectedEventId = payload.events[0]!.id;

  const layersRow = document.createElement('div');
  layersRow.className = 'darb-blk-chips';

  const mapWrap = document.createElement('div');
  mapWrap.className = 'darb-geo-svg-wrap';

  const timelineRow = document.createElement('div');
  timelineRow.className = 'darb-blk-chips';
  timelineRow.setAttribute('data-testid', 'geoTimelineSteps');

  const detailBox = document.createElement('div');
  detailBox.className = 'darb-blk-note';

  if (payload.layers.length > 0) container.appendChild(layersRow);
  if (payload.mode !== 'timeline') container.appendChild(mapWrap);
  if (payload.mode !== 'map') container.appendChild(timelineRow);
  container.appendChild(detailBox);

  const renderAll = () => {
    const visibleEvents = payload.events.filter(
      (ev) => !ev.layerId || payload.layers.length === 0 || activeLayers.has(ev.layerId)
    );
    if (!visibleEvents.some((e) => e.id === selectedEventId) && visibleEvents[0]) {
      selectedEventId = visibleEvents[0].id;
    }

    layersRow.innerHTML = '';
    for (const layer of payload.layers) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isOn = activeLayers.has(layer.id);
      btn.className = `darb-blk-btn ${isOn ? 'active' : ''}`;
      btn.textContent = `${isOn ? '✓' : '+'} ${layer.labelAr}`;
      btn.addEventListener('click', () => {
        if (activeLayers.has(layer.id)) activeLayers.delete(layer.id);
        else activeLayers.add(layer.id);
        renderAll();
      });
      layersRow.appendChild(btn);
    }

    if (payload.mode !== 'timeline') {
      const bgShapes = regionBasePaths(payload.region)
        .map(
          (d) =>
            `<path d="${d}" fill="rgba(212,175,55,0.12)" stroke="rgba(212,175,55,0.45)" stroke-width="0.9" />`
        )
        .join('');

      const routeShapes = payload.routes
        .filter((r) => !r.layerId || payload.layers.length === 0 || activeLayers.has(r.layerId))
        .map((r) => {
          const pts = r.points.map(([x, y]) => `${x},${y}`).join(' ');
          return `<polyline points="${pts}" fill="none" stroke="${r.color}" stroke-width="1.3" stroke-dasharray="2.5 2" />`;
        })
        .join('');

      const pinsSvg = visibleEvents
        .map((ev) => {
          const isSel = ev.id === selectedEventId;
          return `
            <g class="darb-geo-pin" data-event-id="${ev.id}" style="cursor:pointer;">
              <circle cx="${ev.xPercent}" cy="${ev.yPercent}" r="${isSel ? 3.8 : 2.5}" fill="${
                isSel ? '#facc15' : '#38bdf8'
              }" stroke="#0b111e" stroke-width="0.8" />
              <text x="${ev.xPercent}" y="${Math.max(8, ev.yPercent - 4)}" text-anchor="middle" fill="#e2e8f0" font-size="3.4" font-weight="bold">${ev.yearLabel}</text>
            </g>
          `;
        })
        .join('');

      mapWrap.innerHTML = `
        <svg class="darb-geo-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          ${bgShapes}
          ${routeShapes}
          ${pinsSvg}
        </svg>
      `;

      mapWrap.querySelectorAll<HTMLElement>('[data-event-id]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-event-id');
          if (id) {
            selectedEventId = id;
            renderAll();
          }
        });
      });
    }

    timelineRow.innerHTML = '';
    for (const ev of visibleEvents) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `darb-blk-btn ${ev.id === selectedEventId ? 'active' : ''}`;
      btn.textContent = `${ev.yearLabel} • ${ev.titleAr}`;
      btn.addEventListener('click', () => {
        selectedEventId = ev.id;
        renderAll();
      });
      timelineRow.appendChild(btn);
    }

    const active = visibleEvents.find((e) => e.id === selectedEventId);
    detailBox.innerHTML = active
      ? `<strong>${active.yearLabel} — ${active.titleAr}:</strong> ${active.summaryAr}`
      : 'فعّل طبقة واحدة على الأقل لعرض المعالم والأحداث.';
  };

  renderAll();

  return () => {
    layersRow.innerHTML = '';
    mapWrap.innerHTML = '';
    timelineRow.innerHTML = '';
  };
}

export const geoTimelinePlugin: InteractiveBlockPlugin<GeoTimelineBlockPayload> = {
  type: 'geo_timeline',
  labelAr: 'خريطة وخط زمني',
  descriptionAr: 'خريطة تفاعلية متعددة الطبقات مربوطة بخط زمني تاريخي وجغرافي من البيانات',
  icon: '🗺️',
  schema: GeoTimelineBlockPayloadSchema,
  examplePayload: {
    mode: 'hybrid',
    region: 'arab_world',
    mapTitleAr: 'مسار مراكز العلم والحضارة',
    layers: [
      { id: 'science', labelAr: 'مراكز العلم', color: '#38bdf8', visibleByDefault: true },
      { id: 'routes', labelAr: 'طرق القوافل والترجمة', color: '#f59e0b', visibleByDefault: true },
    ],
    routes: [
      {
        id: 'scholars-route',
        labelAr: 'طريق الرحلات العلمية',
        color: '#f59e0b',
        layerId: 'routes',
        points: [
          [72, 48],
          [56, 46],
          [24, 42],
        ],
      },
    ],
    events: [
      {
        id: 'baghdad',
        yearLabel: '830 م',
        titleAr: 'بيت الحكمة في بغداد',
        summaryAr: 'انطلاق حركة الترجمة والبحث في الجبر والبصريات والفلك.',
        xPercent: 72,
        yPercent: 48,
        layerId: 'science',
      },
      {
        id: 'cairo',
        yearLabel: '972 م',
        titleAr: 'الجامع الأزهر بالقاهرة',
        summaryAr: 'أحد أقدم المعاقل العلمية المستمرة لتدريس علوم اللغة والمنطق.',
        xPercent: 56,
        yPercent: 46,
        layerId: 'science',
      },
      {
        id: 'cordoba',
        yearLabel: '950 م',
        titleAr: 'مكتبة قرطبة بالأندلس',
        summaryAr: 'ازدهار الطب والفلك والصناعات الهندسية الدقيقة في الغرب الإسلامي.',
        xPercent: 24,
        yPercent: 42,
        layerId: 'science',
      },
    ],
  },
  extractSearchText: (p) =>
    [p.mapTitleAr ?? '', ...p.events.map((e) => `${e.yearLabel} ${e.titleAr} ${e.summaryAr}`)].join(' '),
  mountInline: mountGeoTimeline,
  mountFullscreen: mountGeoTimeline,
};
