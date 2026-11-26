import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildOfficialTemplateZip, createDefaultParserRegistry } from '@darb/parsers';
import { getOfficialTemplateConfig, getUploadsPolicy } from '../services/configService';

/**
 * مسارات القالب القياسي القابل للتحديث من الإدارة وسجل الصيغ المدعومة
 */
export function registerTemplateRoutes(
  app: FastifyInstance,
  deps: {
    prisma: PrismaClient;
  }
): void {
  const { prisma } = deps;
  const parserRegistry = createDefaultParserRegistry();

  app.get('/api/v1/parsers/formats', async (_request, reply) => {
    const uploadsPolicy = await getUploadsPolicy(prisma);
    return reply.send({
      formats: parserRegistry.listFormats(),
      uploadsPolicy,
    });
  });

  app.get('/api/v1/templates/official', async (_request, reply) => {
    const [templateCfg, uploadsPolicy, activeTaxonomies] = await Promise.all([
      getOfficialTemplateConfig(prisma),
      getUploadsPolicy(prisma),
      prisma.taxonomy.findMany({
        where: { isActive: true },
        orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          group: true,
          slug: true,
          labelAr: true,
          labelEn: true,
        },
      }),
    ]);

    return reply.send({
      template: templateCfg,
      uploadsPolicy,
      formats: parserRegistry.listFormats(),
      activeTaxonomies,
      downloadPath: '/api/v1/templates/official/download',
    });
  });

  app.get('/api/v1/templates/official/download', async (_request, reply) => {
    const [templateCfg, activeTaxonomies] = await Promise.all([
      getOfficialTemplateConfig(prisma),
      prisma.taxonomy.findMany({
        where: { isActive: true },
        orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
        select: { group: true, slug: true, labelAr: true },
        take: 25,
      }),
    ]);

    const zipBuffer = await buildOfficialTemplateZip({
      version: templateCfg.version,
      title: templateCfg.title,
      guideMarkdown: templateCfg.guideMarkdown,
      sampleTaxonomies: activeTaxonomies,
    });

    reply.header('Content-Type', 'application/zip');
    reply.header(
      'Content-Disposition',
      `attachment; filename="darb-book-template-v${templateCfg.version}.zip"`
    );
    reply.header('Content-Length', String(zipBuffer.length));
    return reply.send(zipBuffer);
  });
}
