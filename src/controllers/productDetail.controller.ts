import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getProductDetailRepo } from "../repository/productDetail.repository";

export const getProductDetail = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const productId = Number(req.params.id);

    if (isNaN(productId)) {
      return res.status(400).json({ message: "ID de producto inválido" });
    }

    const product = await getProductDetailRepo(productId, Number(user.locationId));

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    return res.json(product);
  } catch {
    return res.status(500).json({ message: "No se pudo cargar el producto" });
  }
};