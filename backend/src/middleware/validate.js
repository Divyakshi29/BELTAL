import ApiError from '../utils/ApiError.js';

const validate = (schema, source = 'body') => (req, res, next) => {
  // Express 5 leaves req.body undefined when a request carries no body.
  const result = schema.safeParse(req[source] ?? {});

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || source}: ${issue.message}`)
      .join('; ');
    return next(new ApiError(400, message));
  }

  try {
    req[source] = result.data;
  } catch {
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
    });
  }
  next();
};

export default validate;
