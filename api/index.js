const app = require('../server');

module.exports = (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const rawPath = url.searchParams.get('path') ?? req.query?.path;
  const pathSegments = Array.isArray(rawPath) ? rawPath : String(rawPath || '').split('/');
  const segments = pathSegments.filter(Boolean);

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return res.status(400).json({ error: 'Invalid API path.' });
  }

  if (segments.length > 0) {
    url.pathname = `/api/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
    url.searchParams.delete('path');
    req.url = `${url.pathname}${url.search}`;
  }

  return app(req, res);
};
