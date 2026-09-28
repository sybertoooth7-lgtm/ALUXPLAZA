// Maximum accepted JSON request body.
//
// Derivation, so this is not an arbitrary number: the largest single field
// anywhere in the API is the contact form's `message`, capped at 5000 chars by
// express-validator (routes/contact.js). Every other declared field is <= 255.
// There are no bulk/array body endpoints (every .map() over collection data
// operates on DB query results, not req.body) and no multipart uploads, so the
// worst legitimate request is roughly 10-15 KiB even with heavy JSON escaping.
// 256 KiB leaves well over an order of magnitude of headroom.
//
// The point of the cap is bounding memory per in-flight request: at 1 MiB a
// modest number of concurrent large POSTs is a cheap memory-exhaustion lever.
// It is deliberately well above any real payload so it never rejects legitimate
// traffic, and exceeding it is a client error (413), not a server fault — see
// the entity.too.large branch in the error handler in index.js.
export const JSON_BODY_LIMIT = '256kb';
