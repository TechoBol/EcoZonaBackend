import { Request, Response } from "express";
import jwt from "jsonwebtoken";

import {
  createImportationRepo,
  updateImportationRepo,
  changeImportationStatusRepo,
  getImportationByIdRepo,
  getImportationsRepo,
} from "../repository/importation.repository";

const getUser = (req: Request) => {
  const token = req.headers["x-access-token"] as string;
  return jwt.verify(token, process.env.JWTSECRET!) as any;
};

// ─────────────────────────────────────────────
// POST /create-importation
// Crea la importación en estado DRAFT
// ─────────────────────────────────────────────

export const createImportation = async ( req: Request, res: Response ) => {
  try {
    const user = getUser(req);
    const { code, type, products } = req.body;
    const file = req.file;

    if (!code) {
      return res.status(400).json({ message: "El código de importación es requerido" });
    }

    if (!type || !["MANUAL", "EXCEL"].includes(type)) {
      return res.status(400).json({ message: "Tipo de importación inválido" });
    }

    if (type === "EXCEL" && !file) {
      return res.status(400).json({ message: "El archivo Excel es requerido" });
    }

    if (type === "MANUAL") {
      let parsedProducts = products;
      if (typeof products === "string") parsedProducts = JSON.parse(products);

      if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
        return res.status(400).json({ message: "Los productos son requeridos" });
      }

      req.body.products = parsedProducts;
    }

    const result = await createImportationRepo({
      code: code.trim().toUpperCase(),
      type,
      file,
      products: req.body.products || [],
      employeeId: Number(user.id),
      locationId: Number(req.body.locationId),
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error("❌ ERROR CREATE IMPORTATION:", error);

    if (error.code === "P2002") {
      return res.status(400).json({ message: "El código de importación ya existe" });
    }

    if (error.message?.includes("PRODUCT_NOT_FOUND")) {
      const productCode = error.message.split(":")[1];
      return res.status(400).json({ message: `Producto no encontrado (${productCode})` });
    }

    return res.status(500).json({ message: error.message || "No se pudo crear la importación" });
  }
};

// ─────────────────────────────────────────────
// PUT /update-importation/:id
// Edita items de una importación en DRAFT
// ─────────────────────────────────────────────

export const updateImportation = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const { products, type } = req.body;
    const file = req.file;

    if (type === "MANUAL") {
      let parsedProducts = products;
      if (typeof products === "string") parsedProducts = JSON.parse(products);

      if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
        return res.status(400).json({ message: "Los productos son requeridos" });
      }

      req.body.products = parsedProducts;
    }

    if (type === "EXCEL" && !file) {
      return res.status(400).json({ message: "El archivo Excel es requerido" });
    }

    const result = await updateImportationRepo({
      id,
      products: req.body.products || [],
      file,
      type,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("❌ ERROR UPDATE IMPORTATION:", error);

    if (error.message === "INVALID_STATUS") {
      return res.status(400).json({
        message: "Solo se pueden editar importaciones en borrador",
      });
    }

    if (error.message === "Importación no encontrada") {
      return res.status(404).json({ message: error.message });
    }

    if (error.message?.includes("PRODUCT_NOT_FOUND")) {
      const productCode = error.message.split(":")[1];
      return res.status(400).json({ message: `Producto no encontrado (${productCode})` });
    }

    return res.status(500).json({ message: error.message || "No se pudo actualizar la importación" });
  }
};

// ─────────────────────────────────────────────
// PATCH /importation/:id/status
// Cambia estado: APPROVED (aplica inventario) o CANCELLED (bloquea)
// ─────────────────────────────────────────────

export const changeImportationStatus = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const id = Number(req.params.id);

    if (!id) return res.status(400).json({ message: "ID inválido" });

    const { status } = req.body;

    if (!status || !["APPROVED", "CANCELLED"].includes(status)) {
      return res.status(400).json({
        message: "Estado inválido. Use APPROVED o CANCELLED",
      });
    }

    const result = await changeImportationStatusRepo({
      id,
      status,
      resolvedById: Number(user.id),
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("❌ ERROR CHANGE IMPORTATION STATUS:", error);

    if (error.message === "INVALID_STATUS") {
      return res.status(400).json({
        message: "Solo se pueden aprobar o cancelar importaciones en borrador",
      });
    }

    if (error.message === "Importación no encontrada") {
      return res.status(404).json({ message: error.message });
    }

    if (error.message?.includes("PRODUCT_NOT_FOUND")) {
      const productCode = error.message.split(":")[1];
      return res.status(400).json({ message: `Producto no encontrado (${productCode})` });
    }

    return res.status(500).json({ message: error.message || "No se pudo cambiar el estado" });
  }
};

// ─────────────────────────────────────────────
// GET /get-importations
// ─────────────────────────────────────────────

export const getImportations = async ( _req: Request, res: Response) => {
  try {
    const importations = await getImportationsRepo();
    return res.status(200).json(importations);
  } catch (error) {
    console.error("❌ ERROR GET IMPORTATIONS:", error);
    return res.status(500).json({ message: "No se pudieron obtener las importaciones" });
  }
};

// ─────────────────────────────────────────────
// GET /get-importation/:id
// ─────────────────────────────────────────────

export const getImportationById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const importation = await getImportationByIdRepo(id);
    if (!importation) return res.status(404).json({ message: "Importación no encontrada" });

    return res.status(200).json(importation);
  } catch (error) {
    console.error("❌ ERROR GET IMPORTATION:", error);
    return res.status(500).json({ message: "No se pudo obtener la importación" });
  }
};