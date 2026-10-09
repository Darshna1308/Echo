const mongoose = require("mongoose");
const multer = require("multer");

const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

function notFound(req, res, next) {
  next(AppError.notFound(`No API route for ${req.method} ${req.path}.`));
}

/*
  Every error ends up here. Users get a consistent, safe JSON shape:
    { success: false, message, errors?, code? }
  Internal details (stack traces, database messages) are only logged.
*/
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large."
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Please upload one file using the field name \"file\"."
          : "The upload could not be processed.";
    error = new AppError(err.code === "LIMIT_FILE_SIZE" ? 413 : 400, message);
  } else if (err instanceof mongoose.Error.CastError) {
    error = AppError.notFound("Not found.");
  } else if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = AppError.badRequest("Some fields are not valid.", errors);
  } else if (err?.type === "entity.too.large") {
    error = new AppError(413, "The request is too large.");
  } else if (err?.type === "entity.parse.failed") {
    error = AppError.badRequest("The request body is not valid JSON.");
  } else if (err?.code === 11000) {
    error = AppError.conflict("That already exists.");
  }

  if (!(error instanceof AppError)) {
    logger.error("unhandled_error", {
      reqId: req.id,
      method: req.method,
      path: req.path,
      error: { name: err?.name, message: err?.message },
      stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
    });
    error = new AppError(500, "Something went wrong on our side. Please try again.");
  }

  const body = { success: false, message: error.message };
  if (error.errors) body.errors = error.errors;
  if (error.code && typeof error.code === "string") body.code = error.code;

  res.status(error.status || 500).json(body);
}

module.exports = {
  notFound,
  errorHandler,
};
