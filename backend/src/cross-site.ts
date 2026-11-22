import type { RequestHandler } from 'express';

import { sendError } from './standard/http.js';

// Refuses a state-changing request that the browser says came from another page (#333). A form on
// another site can POST without a CORS preflight, and four routes change data on a POST with no
// body. Browsers always send Sec-Fetch-Site: `same-origin` for the app's own screens (and the Vite
// proxy), `same-site` or `cross-site` for a page elsewhere. A client that sends none (curl, a
// script, shared-ai) is not a browser page, so it is left alone, as are reads.
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedSites = new Set(['same-origin', 'none']);

export const refuseCrossSiteWrites: RequestHandler = (req, res, next) => {
  const site = req.get('sec-fetch-site');
  if (site === undefined || safeMethods.has(req.method) || allowedSites.has(site)) return next();
  sendError(res, 403, 'This request came from another site');
};
