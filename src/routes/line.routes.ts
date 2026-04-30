import { Router } from "express";
import {
  getLines,
  createLines,
  updateLines,
  deleteLines,
  addBrand,
  updateBrand,
  deleteBrand,
} from "../controllers/line.controller";

const router = Router();

// Lines
router.get("/get-lines", getLines);
router.post("/create-line", createLines);
router.put("/update-line/:id", updateLines);
router.delete("/delete-line/:id", deleteLines);

// Brands (dentro de una línea)
router.post("/add-brand/:id", addBrand);
router.put("/update-brand/:id", updateBrand);
router.delete("/delete-brand/:id", deleteBrand);

export default router;