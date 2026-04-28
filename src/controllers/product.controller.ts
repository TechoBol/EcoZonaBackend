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
    } = req.body;

    if (
      !name ||
      !barcode ||
      price == null ||
      finalPrice == null ||
      locationId == null
    ) {
      return res.status(400).json({
        message: "Por favor, completa los campos requeridos",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name,
          description,
          barcode,
          imageUrl,
          price: Number(price),
          finalPrice: Number(finalPrice),
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
    console.log(user.role);
    const isManagement =
      user.role.includes("Gerente") ||
      user.role.includes("Subgerente") ||
      user.role.includes("Jefe");
    const products = await getProductsRepo(
      Number(user.locationId),
      isManagement,
    );
    return res.json(products);
  } catch {
    return res.status(500).json({ message: "No se pudieron obtener los productos" });
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

    const updated = await updateProductRepo(id, req.body);

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: "No se pudo actualizar el producto" });
  }
};

// DELETE (soft delete)
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await deleteProductRepo(id);

    return res.json({ message: "Producto eliminado" });
  } catch {
    return res.status(500).json({ message: "No se pudo eliminar el producto" });
  }
};
