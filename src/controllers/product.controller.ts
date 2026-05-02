import { Request, Response } from "express";
import prisma from "../config/db";

import {
  getProductsRepo,
  getProductByIdRepo,
  updateProductRepo,
  deleteProductRepo,
} from "../repository/product.repository";
import jwt from "jsonwebtoken";

export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      barcode,
      imageUrl,
      price,
      finalPrice,
      stock,
      locationId,
      lineId,
      brandName,
    } = req.body;

    // 🔎 VALIDACIÓN
    if (
      !name ||
      !barcode ||
      price == null ||
      finalPrice == null ||
      locationId == null ||
      !lineId ||
      !brandName
    ) {
      return res.status(400).json({
        message: "Por favor, completa los campos requeridos",
      });
    }

    // 🔎 VALIDAR LÍNEA
    const line = await prisma.line.findUnique({
      where: { id: Number(lineId) },
    });

    if (!line) {
      return res.status(400).json({
        message: "Línea inválida",
      });
    }

    // 🔎 VALIDAR MARCA (STRING[])
    const brands = (line.brands as string[]) || [];

    const isValidBrand = brands.some(
      (b) => b.toLowerCase().trim() === brandName.toLowerCase().trim(),
    );

    if (!isValidBrand) {
      return res.status(400).json({
        message: "La marca no pertenece a la línea",
      });
    }

    // 🔥 CREAR
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name,
          description,
          barcode,
          imageUrl,
          price: Number(price),
          finalPrice: Number(finalPrice),
          lineId: Number(lineId),
          brandName: brandName.trim(),
        },
      });

      await tx.inventory.create({
        data: {
          productId: product.id,
          locationId: Number(locationId),
          quantity: Number(stock) || 0,
        },
      });

      return product;
    });

    return res.json(result);
  } catch (err: any) {
    console.error(err);

    if (err.code === "P2002") {
      return res.status(400).json({
        message: "El producto ya está registrado",
      });
    }

    return res.status(500).json({
      message: "No se pudo crear el producto",
    });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const isManagement = user.level === 1 || user.level === 4;

    const products = await getProductsRepo(
      Number(user.locationId),
      isManagement,
    );

    return res.json(products);
  } catch {
    return res
      .status(500)
      .json({ message: "No se pudieron obtener los productos" });
  }
};

// GET ONE
export const getProductById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const product = await getProductByIdRepo(id);

    if (!product) {
      return res.status(404).json({ message: "No se encontró el producto" });
    }

    return res.json(product);
  } catch {
    return res.status(500).json({ message: "No se pudo cargar el producto" });
  }
};

// UPDATE
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const {
      name,
      description,
      barcode,
      imageUrl,
      price,
      finalPrice,
      stock,
      locationId,
      lineId,
      brandName,
    } = req.body;

    if (!name || !barcode || !lineId || !brandName) {
      return res.status(400).json({
        message: "Campos incompletos",
      });
    }

    // 🔎 VALIDAR LÍNEA
    const line = await prisma.line.findUnique({
      where: { id: Number(lineId) },
    });

    if (!line) {
      return res.status(400).json({
        message: "Línea inválida",
      });
    }

    // 🔎 VALIDAR MARCA
    const brands = (line.brands as string[]) || [];

    const isValidBrand = brands.some(
      (b) => b.toLowerCase().trim() === brandName.toLowerCase().trim(),
    );

    if (!isValidBrand) {
      return res.status(400).json({
        message: "Marca inválida",
      });
    }

    const updated = await updateProductRepo(id, {
      name,
      description,
      barcode,
      imageUrl,
      price: Number(price),
      finalPrice: Number(finalPrice),
      lineId: Number(lineId),
      brandName: brandName.trim(),
      stock: stock != null ? Number(stock) : undefined,
      locationId: locationId ? Number(locationId) : undefined,
    });

    return res.json(updated);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "No se pudo actualizar el producto",
    });
  }
};

// DELETE
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await deleteProductRepo(id);

    return res.json({ message: "Producto eliminado" });
  } catch {
    return res.status(500).json({ message: "No se pudo eliminar el producto" });
  }
};
