const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

require("dotenv").config();

const app = express();

app.use(cors());

app.use(
  express.json({
    limit: "10mb",
  })
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Echo backend is running.",
  });
});

// ==========================================
// ROUTES
// ==========================================

const memoryRoutes = require(
  "./routes/memoryRoutes"
);

const authRoutes = require(
  "./routes/authRoutes"
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/memories",
  memoryRoutes
);

// ==========================================
// START SERVER
// ==========================================

const PORT =
  process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(
      "MongoDB connected successfully."
    );

    app.listen(
      PORT,
      () => {
        console.log(
          `Echo backend running on http://localhost:${PORT}`
        );
      }
    );
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed:",
      error.message
    );
  });