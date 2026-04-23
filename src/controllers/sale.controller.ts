import { Request, Response } from "express";
import prisma from "../config/db";
import {
  createSaleRepo,
  createSaleDetailRepo,
  getInventoryRepo,
  updateInventoryRepo,
} from "../repository/sale.repository";
import jwt from "jsonwebtoken";

export const createSale = async (req: Request, res: Response) => {
  try {
    const { locationId, products } = req.body;
    const token = req.headers["x-access-token"] as string;

    let total = 0;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    for (const item of products) {
      const inventory = await getInventoryRepo(item.productId, locationId);

      if (!inventory || inventory.quantity < item.quantity) {
        return res.status(400).json({
          message: "insufficient stock",
        });
      }
    }
    const employeeId = user.id
    const sale = await createSaleRepo({
      employeeId,
      locationId,
      total: 0,
    });

    for (const item of products) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        return res.status(400).json({
          message: "product not found",
        });
      }

      const price = product.finalPrice;

      total += price * item.quantity;

      await createSaleDetailRepo({
        saleId: sale.id,
        productId: item.productId,
        quantity: item.quantity,
        price,
      });

      await updateInventoryRepo(item.productId, locationId, item.quantity);
    }

    await prisma.sale.update({
      where: { id: sale.id },
      data: { total },
    });

    return res.json({
      message: "sale completed",
      saleId: sale.id,
      total,
    });
  } catch (err) {
    return res.status(500).json({ message: "error creating sale" });
  }
};
