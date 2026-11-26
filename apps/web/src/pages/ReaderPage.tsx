import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BookReaderShell } from '../components/BookReaderShell';

export const ReaderPage: React.FC<{ fallbackEdition?: string; fallbackSpread?: number }> = ({
  fallbackEdition,
  fallbackSpread = 0,
}) => {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();

  const editionSlug = slug || searchParams.get('edition') || fallbackEdition || 'epic-v1';
  const spreadRaw = searchParams.get('spread');
  const parsedSpread = spreadRaw ? parseInt(spreadRaw, 10) : fallbackSpread;
  const startSpread = Number.isFinite(parsedSpread) && parsedSpread >= 0 ? parsedSpread : 0;
  const previewVersionId = searchParams.get('versionId') || undefined;

  return (
    <BookReaderShell
      initialEditionSlug={editionSlug}
      initialSpread={startSpread}
      initialVersionId={previewVersionId}
    />
  );
};
