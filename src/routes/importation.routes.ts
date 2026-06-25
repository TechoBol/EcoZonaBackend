import { Router } from "express";
import multer from "multer";

import {
  createImportation,
  updateImportation,
  changeImportationStatus,
  getImportations,
  getImportationById,
} from "../controllers/importation.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Crear importación → queda en DRAFT
router.post("/create-importation", upload.single("file"), createImportation);

// Editar importación (solo DRAFT)
router.put("/update-importation/:id", upload.single("file"), updateImportation);

// Aprobar o cancelar
router.patch("/importation/:id/status", changeImportationStatus);

// Historial
router.get("/get-importations", getImportations);

// Detalle
router.get("/get-importation/:id", getImportationById);

export default router;