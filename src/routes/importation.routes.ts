import { Router } from "express";

import multer from "multer";

import {
  createImportation,
  getImportationById,
  getImportations,
} from "../controllers/importation.controller";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() });

// Crear importación (Excel, Manual)
router.post( "/create-importation", upload.single("file"), createImportation );
// Historial
router.get( "/get-importations", getImportations );
// Detalle
router.get( "/get-importation/:id", getImportationById );

export default router;