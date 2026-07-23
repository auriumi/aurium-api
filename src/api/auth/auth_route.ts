import { Router } from "express";
import * as authController from "./auth_controller";
import { verifyToken } from "./auth_middleware";

const router = Router();

router.post("/login", authController.handleLogin);
router.get("/logout", authController.handleLogout);
router.post("/forgot-password", authController.handleForgotPassword);
router.post("/reset-password", authController.handleResetPassword);

router.post("/update", verifyToken, authController.handleUpdatePassById);

export default router;
