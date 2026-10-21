export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (message, fieldErrors) =>
  new HttpError(400, message, fieldErrors ? { fieldErrors } : {});

// Out-of-scope records always look like missing ones (FR-2.5).
export const notFound = () => new HttpError(404, "We couldn't find that page.");

export const conflict = (message, extra) => new HttpError(409, message, extra);

/** Converts a failed zod parse into a 400 with per-field messages. */
export function fromZod(error) {
  const fieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return badRequest('Please correct the highlighted fields.', fieldErrors);
}

export function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw fromZod(result.error);
  return result.data;
}
