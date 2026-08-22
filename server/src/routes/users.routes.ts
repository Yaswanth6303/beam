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

const router = Router();

router.route("/login").post(login);
router.route("/register").post(register);
router.route("/add_to_activity").post(addToHistory);
router.route("/get_all_activity").get(getUserHistory);
router.route("/delete_from_activity").delete(deleteFromHistory);
router.route("/clear_activity").delete(clearHistory);

// Bearer-token routes.
router
    .route("/profile")
    .get(requireAuth, getProfile)
    .patch(requireAuth, updateProfile);
router.route("/change_password").post(requireAuth, changePassword);

export default router;
