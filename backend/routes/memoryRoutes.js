const express = require("express");

const Memory = require("../models/Memory");

const protect = require(
  "../middleware/authMiddleware"
);

const router = express.Router();

// ==========================================
// CREATE MEMORY
// ==========================================

router.post(
  "/",
  protect,
  async (req, res) => {
    try {
      const memory = await Memory.create({
        ...req.body,
        userId: req.user.userId,
      });

      res.status(201).json({
        success: true,
        memory,
      });
    } catch (error) {
      console.error(
        "Create memory error:",
        error
      );

      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ==========================================
// GET ALL MEMORIES
// ==========================================

router.get(
  "/",
  protect,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      /*
        Existing memories created before
        authentication don't have userId.

        We claim those memories for the first
        authenticated Echo account.
      */

      await Memory.updateMany(
        {
          userId: {
            $exists: false,
          },
        },
        {
          $set: {
            userId,
          },
        }
      );

      const memories =
        await Memory.find({
          userId,
        }).sort({
          date: -1,
        });

      res.json({
        success: true,
        memories,
      });
    } catch (error) {
      console.error(
        "Get memories error:",
        error
      );

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ==========================================
// GET ONE MEMORY
// ==========================================

router.get(
  "/:id",
  protect,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      let memory =
        await Memory.findOne({
          _id: req.params.id,
          userId,
        });

      /*
        If this is one of the old memories
        without an owner, give it to the
        currently authenticated user.
      */

      if (!memory) {
        memory =
          await Memory.findOne({
            _id: req.params.id,
            userId: {
              $exists: false,
            },
          });

        if (memory) {
          memory.userId = userId;
          await memory.save();
        }
      }

      if (!memory) {
        return res.status(404).json({
          success: false,
          message: "Memory not found.",
        });
      }

      res.json({
        success: true,
        memory,
      });
    } catch (error) {
      console.error(
        "Get memory error:",
        error
      );

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ==========================================
// UPDATE MEMORY
// ==========================================

router.put(
  "/:id",
  protect,
  async (req, res) => {
    try {
      const memory =
        await Memory.findOneAndUpdate(
          {
            _id: req.params.id,
            userId: req.user.userId,
          },
          {
            ...req.body,

            /*
              Never allow the frontend to
              change the owner.
            */
            userId: req.user.userId,
          },
          {
            new: true,
            runValidators: true,
          }
        );

      if (!memory) {
        return res.status(404).json({
          success: false,
          message:
            "Memory not found or you do not have permission to edit it.",
        });
      }

      res.json({
        success: true,
        message:
          "Memory updated successfully.",
        memory,
      });
    } catch (error) {
      console.error(
        "Update memory error:",
        error
      );

      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// ==========================================
// DELETE MEMORY
// ==========================================

router.delete(
  "/:id",
  protect,
  async (req, res) => {
    try {
      const memory =
        await Memory.findOneAndDelete({
          _id: req.params.id,
          userId: req.user.userId,
        });

      if (!memory) {
        return res.status(404).json({
          success: false,
          message:
            "Memory not found or you do not have permission to delete it.",
        });
      }

      res.json({
        success: true,
        message:
          "Memory deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Delete memory error:",
        error
      );

      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

module.exports = router;