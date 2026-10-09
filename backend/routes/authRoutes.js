const express = require("express");

const {
  register,
  login,
  me,
} = require("../controllers/authController");

const protect = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

// Create account
router.post(
  "/register",
  register
);

// Login
router.post(
  "/login",
  login
);

// Current logged-in user
router.get(
  "/me",
  protect,
  me
);

module.exports = router;