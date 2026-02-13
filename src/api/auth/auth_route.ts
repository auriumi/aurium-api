import { Router } from "express";
import * as authController from "./auth_controller";

const router = Router();

router.post("/login", authController.handleLogin);
router.get("/logout", authController.handleLogout);

export default router;