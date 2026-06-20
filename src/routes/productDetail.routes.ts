import { Router } from "express";
import { getProductDetail } from "../controllers/productDetail.controller";

const router = Router();

router.get("/:id", getProductDetail);

export default router;