export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const errorCodes = {
  400: 'invalid_request', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found',
  409: 'conflict', 410: 'expired', 413: 'payload_too_large', 415: 'unsupported_media_type',
  429: 'rate_limited', 500: 'internal_error', 503: 'unavailable',
};

export function versionedErrors(_req, res, next) {
  const json = res.json.bind(res);
  res.json = body => json(typeof body?.error === 'string'
    ? { error: { code: errorCodes[res.statusCode] ?? 'request_failed', message: body.error } }
    : body);
  res.locals.versionedApi = true;
  next();
}

export function handleError(error, _req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) {
    const body = error.code && res.locals.versionedApi
      ? { code: error.code, message: error.message } : error.message;
    return res.status(error.status).json({ error: body });
  }
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Neveljavni podatki JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Zahteva je prevelika.' });
  console.error(error.name);
  return res.status(500).json({ error: 'Prišlo je do napake na strežniku.' });
}
