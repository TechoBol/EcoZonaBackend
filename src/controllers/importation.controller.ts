import { Request, Response } from "express";
import jwt from "jsonwebtoken";

import {
  createImportationRepo,
  getImportationByIdRepo,
  getImportationsRepo,
} from "../repository/importation.repository";

export const createImportation = async (
  req: Request,
  res: Response,
) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(
      token,
      process.env.JWTSECRET!,
    ) as any;

    const {
      code,
      type,
      products,
    } = req.body;

    const file = req.file;

    if (!code) {
      return res.status(400).json({
        message: "El código de importación es requerido",
      });
    }

    if (!type || !["MANUAL", "EXCEL"].includes(type)) {
      return res.status(400).json({
        message: "Tipo de importación inválido",
      });
    }

    if (type === "EXCEL" && !file) {
      return res.status(400).json({
        message: "El archivo Excel es requerido",
      });
    }

    if (type === "MANUAL") {
      let parsedProducts = products;
      if (typeof products === "string") {
        parsedProducts = JSON.parse(products);
      }

      if (
        !Array.isArray(parsedProducts) ||
        parsedProducts.length === 0
      ) {
        return res.status(400).json({
          message: "Los productos son requeridos",
        });
      }

      req.body.products = parsedProducts;
    }

    const result = await createImportationRepo({
      code: code.trim().toUpperCase(),

      type,
      file,
      products: req.body.products || [],
      employeeId: Number(user.id),
      locationId: Number(user.locationId),
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error("❌ ERROR CREATE IMPORTATION:", error);

    if (error.code === "P2002") {
      return res.status(400).json({
        message: "El código de importación ya existe",
      });
    }

    if (error.message?.includes("PRODUCT_NOT_FOUND")) {
      const barcode = error.message.split(":")[1];

      return res.status(400).json({
        message: `Producto no encontrado (${barcode})`,
      });
    }

    return res.status(500).json({
      message: error.message || "No se pudo crear la importación",
    });
  }
};

export const getImportations = async (
  req: Request,
  res: Response,
) => {
  try {
    const token = req.headers["x-access-token"] as string;

    const user = jwt.verify(
      token,
      process.env.JWTSECRET!,
    ) as any;

    const importations = await getImportationsRepo(
      Number(user.locationId),
    );

    return res.status(200).json(importations);
  } catch (error) {
    console.error("❌ ERROR GET IMPORTATIONS:", error);

    return res.status(500).json({
      message: "No se pudieron obtener las importaciones",
    });
  }
};

export const getImportationById = async (
  req: Request,
  res: Response,
) => {
  try {

    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "ID inválido",
      });
    }

    const importation = await getImportationByIdRepo(id);

    if (!importation) {
      return res.status(404).json({
        message: "Importación no encontrada",
      });
    }

    return res.status(200).json(importation);
  } catch (error) {
    console.error("❌ ERROR GET IMPORTATION:", error);

    return res.status(500).json({
      message: "No se pudo obtener la importación",
    });
  }
};