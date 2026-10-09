const mongoose = require("mongoose");
const AppError = require("../utils/AppError");

/*
  validate(schema, "body" | "query")
  Parses the request part with a zod schema. On success the parsed (trimmed,
  coerced) value replaces the original; on failure a 400 with per-field
  messages is returned.
*/
function validate(schema, part = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || part,
        message: issue.message,
      }));
      return next(AppError.badRequest(errors[0]?.message || "Some fields are not valid.", errors));
    }
    if (part === "query") {
      // Express 5's req.query is a getter; store parsed query separately.
      req.validQuery = result.data;
    } else {
      req[part] = result.data;
    }
    return next();
  };
}

/* Rejects malformed ids with a 404 so ids can't be probed for format errors. */
function validId(param = "id") {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[param]) || String(req.params[param]).length !== 24) {
      return next(AppError.notFound("Not found."));
    }
    return next();
  };
}

module.exports = {
  validate,
  validId,
};
