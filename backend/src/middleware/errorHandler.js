import logger from '../config/logger.js';

// Prisma request errors that map cleanly onto a client-facing status.
const PRISMA_ERRORS = {
  P2002: [409, 'A record with these unique values already exists'],
  P2003: [400, 'Referenced record does not exist'],
  P2025: [404, 'Record not found'],
};

const errorHandler = (err, req, res, next) => {
  const prismaError = PRISMA_ERRORS[err.code];
  const status = err.status || err.statusCode || (prismaError ? prismaError[0] : 500);
  let message = err.message || 'Internal Server Error';

  if (!err.status && prismaError) {
    message = prismaError[1];
  } else if (status >= 500 && !err.status && process.env.NODE_ENV === 'production') {
    // Unexpected failures (driver/runtime errors) shouldn't leak internals.
    message = 'Internal Server Error';
  }

  if (status >= 500 && !err.status) {
    // Unexpected error: keep the stack for diagnosis (deliberate ApiErrors don't need one).
    logger.error(`${err.message} (status ${status})${err.stack ? `\n${err.stack}` : ''}`);
  } else {
    logger.error(`${message} (status ${status})`);
  }
  res.status(status).json({ error: { message, status } });
};

export default errorHandler;
