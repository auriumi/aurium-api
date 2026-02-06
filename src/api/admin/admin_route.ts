import { Router } from "express";
import * as adminController from "./admin_controller";

const router = Router();

router.post("/verify", adminController.handleVerify);