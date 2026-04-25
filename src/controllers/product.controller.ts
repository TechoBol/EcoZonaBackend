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
        message: "missing required fields",
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
        message: "barcode already exists",
      });
    }

    return res.status(500).json({
      message: "error creating product",
    });
  }
};

// 🔥 GET ALL
export const getProducts = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;

    const user = jwt.verify(token, process.env.JWTSECRET!) as any;
    const products = await getProductsRepo(Number(user.locationId));
    return res.json(products);
  } catch {
    return res.status(500).json({ message: "error fetching products" });
  }
};

// 🔥 GET ONE
export const getProductById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const product = await getProductByIdRepo(id);

    if (!product) {
      return res.status(404).json({ message: "product not found" });
    }

    return res.json(product);
  } catch {
    return res.status(500).json({ message: "error fetching product" });
  }
};

// 🔥 UPDATE
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const updated = await updateProductRepo(id, req.body);

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: "error updating product" });
  }
};

// 🔥 DELETE (soft delete)
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await deleteProductRepo(id);

    return res.json({ message: "product deleted" });
  } catch {
    return res.status(500).json({ message: "error deleting product" });
  }
};
