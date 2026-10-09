/*
  An error that is safe to show to the user.
  Anything that is NOT an AppError becomes a generic 500 message,
  so internal details never leak into API responses.
*/
class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.expose = true;
    Object.assign(this, extra);
  }

  static badRequest(message, errors) {
    return new AppError(400, message, errors ? { errors } : {});
  }

  static unauthorized(message = "Please log in to continue.") {
    return new AppError(401, message);
  }

  static forbidden(message = "You do not have access to this.") {
    return new AppError(403, message);
  }

  static notFound(message = "Not found.") {
    return new AppError(404, message);
  }

  static conflict(message) {
    return new AppError(409, message);
  }
}

module.exports = AppError;
