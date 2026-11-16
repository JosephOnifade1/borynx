/** Dependency-free so it can be imported from boot-time code (instrumentation, seed, services). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
  ) {
    super(message);
  }
}
