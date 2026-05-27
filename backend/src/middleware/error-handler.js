export function notFound(request, response) {
  response.status(404).json({
    message: `Route ${request.method} ${request.originalUrl} was not found.`,
  });
}

export function errorHandler(error, _request, response, _next) {
  if (error.statusCode) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error.code === '23505') {
    response.status(409).json({ message: 'A record with these unique values already exists.' });
    return;
  }

  if (error.code === '23503') {
    response.status(409).json({ message: 'The operation conflicts with a related record.' });
    return;
  }

  if (error.code === '23514') {
    response.status(400).json({ message: 'The data violates a database rule.' });
    return;
  }

  console.error(error);
  response.status(error.statusCode ?? 500).json({
    message: 'Internal server error.',
  });
}
