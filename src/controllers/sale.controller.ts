import { Request, Response } from "express";
import prisma from "../config/db";
import {
  createSaleRepo,
  createSaleDetailRepo,
  getInventoryRepo,
  updateInventoryRepo,
  incrementLocationCounterRepo,
  getProductRepo,
  updateSaleTotalRepo,
} from "../repository/sale.repository";
import jwt from "jsonwebtoken";

export const createSale = async (req: Request, res: Response) => {
  try {
    const { locationId, products } = req.body;
    const token = req.headers["x-access-token"] as string;

    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const result = await prisma.$transaction(async (tx) => {
      let total = 0;

      // 🔥 1. validar stock
      for (const item of products) {
        const inventory = await getInventoryRepo(tx, item.productId, locationId);

        if (!inventory || inventory.quantity < item.quantity) {
          throw new Error("insufficient stock");
        }
      }

      // 🔥 2. incrementar contador
      const location = await incrementLocationCounterRepo(tx, locationId);

      const saleNumber = location.saleCounter;
      const code = `${location.abbreviation}-${saleNumber}`;

      // 🔥 3. crear venta
      const sale = await createSaleRepo(tx, {
        employeeId: user.id,
        locationId,
        total: 0,
        code,
        pdfUrl: `ECOZONA/SALES/${code}.pdf`,
      });

      // 🔥 4. detalles
      for (const item of products) {
        const product = await getProductRepo(tx, item.productId);

        if (!product) throw new Error("product not found");

        const price = product.finalPrice;

        total += price * item.quantity;

        await createSaleDetailRepo(tx, {
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          price,
        });

        await updateInventoryRepo(tx, item.productId, locationId, item.quantity);
      }

      // 🔥 5. total
      await updateSaleTotalRepo(tx, sale.id, total);

      return {
        saleId: sale.id,
        total,
        code,
      };
    });

    return res.json({
      message: "sale completed",
      ...result,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "error creating sale",
    });
  }
};