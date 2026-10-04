// Usage: router.post('/x', validate(zodSchema), handler)
// On success req.body (or query/params) is replaced with the cleaned, typed data.
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req[source] = result.data;
  next();
};

module.exports = validate;