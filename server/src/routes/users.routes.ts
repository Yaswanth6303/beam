import { Router } from "express";
import {
    login,
    register,
    getUserHistory,
    addToHistory,
    deleteFromHistory,
    clearHistory,
    getProfile,
    updateProfile,
    changePassword
} from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../middlewares/rate-limit.middleware.js";

const router = Router();

// Slows password guessing and bulk account creation.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.route("/login").post(authLimiter, login);
router.route("/register").post(authLimiter, register);

// Everything below takes the token as an Authorization: Bearer header.
router.route("/add_to_activity").post(requireAuth, addToHistory);
router.route("/get_all_activity").get(requireAuth, getUserHistory);
router.route("/delete_from_activity").delete(requireAuth, deleteFromHistory);
router.route("/clear_activity").delete(requireAuth, clearHistory);
router
    .route("/profile")
    .get(requireAuth, getProfile)
    .patch(requireAuth, updateProfile);
router.route("/change_password").post(authLimiter, requireAuth, changePassword);

export default router;
