import type sql from 'mssql';

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
}

/**
 * Parses either Prisma-style ADO SQL Server connection strings:
 *   sqlserver://127.0.0.1:1433;database=darb_books;user=darb;password=...;encrypt=false;trustServerCertificate=true
 * or standard URI format:
 *   mssql://user:password@127.0.0.1:1433/darb_books?encrypt=false&trustServerCertificate=true
 */
export function parseSqlServerConfig(
  connectionString: string,
  databaseOverride?: string,
): sql.config {
  const trimmed = connectionString.trim();
  const options: sql.IOptions = {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  };

  if (/^mssql:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed.replace(/^mssql:\/\//i, 'http://'));
    const dbFromPath = parsed.pathname.replace(/^\//, '');
    const encryptParam = parsed.searchParams.get('encrypt') ?? undefined;
    const trustParam = parsed.searchParams.get('trustServerCertificate') ?? undefined;
    options.encrypt = parseBool(encryptParam, false);
    options.trustServerCertificate = parseBool(trustParam, true);

    return {
      server: parsed.hostname || '127.0.0.1',
      port: parsed.port ? Number(parsed.port) : 1433,
      database: databaseOverride ?? (dbFromPath || 'darb_books'),
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      options,
    };
  }

  const body = trimmed.replace(/^sqlserver:\/\//i, '');
  const segments = body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  const serverSegment = segments[0] ?? '127.0.0.1:1433';
  const params = new Map<string, string>();
  for (const seg of segments.slice(1)) {
    const eqIndex = seg.indexOf('=');
    if (eqIndex === -1) continue;
    const key = seg.slice(0, eqIndex).trim().toLowerCase();
    const val = seg.slice(eqIndex + 1).trim();
    params.set(key, val);
  }

  let serverHost = serverSegment;
  let port: number | undefined = 1433;
  let instanceName: string | undefined;

  if (serverSegment.includes('\\')) {
    const [hostPart, instPart] = serverSegment.split('\\', 2);
    serverHost = hostPart || '127.0.0.1';
    if (instPart.includes(':')) {
      const [instOnly, portStr] = instPart.split(':', 2);
      instanceName = instOnly || undefined;
      port = portStr ? Number(portStr) : undefined;
    } else {
      instanceName = instPart || undefined;
      port = undefined;
    }
  } else if (serverSegment.includes(':')) {
    const [hostPart, portStr] = serverSegment.split(':', 2);
    serverHost = hostPart || '127.0.0.1';
    port = portStr ? Number(portStr) : 1433;
  } else if (serverSegment.includes(',')) {
    const [hostPart, portStr] = serverSegment.split(',', 2);
    serverHost = hostPart || '127.0.0.1';
    port = portStr ? Number(portStr) : 1433;
  }

  if (instanceName) {
    options.instanceName = instanceName;
  }
  options.encrypt = parseBool(params.get('encrypt'), false);
  options.trustServerCertificate = parseBool(params.get('trustservercertificate'), true);

  const config: sql.config = {
    server: serverHost,
    database:
      databaseOverride ?? params.get('database') ?? params.get('initial catalog') ?? 'darb_books',
    user: params.get('user') ?? params.get('uid') ?? params.get('user id') ?? 'darb',
    password: params.get('password') ?? params.get('pwd') ?? '',
    options,
  };

  if (port !== undefined && !Number.isNaN(port)) {
    config.port = port;
  }

  return config;
}
