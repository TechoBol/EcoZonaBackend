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
  getSalesRepo,
} from "../repository/sale.repository";
import jwt from "jsonwebtoken";

export const createSale = async (req: Request, res: Response) => {
  try {
    const { locationId, products, codigoTransaccion, metodoPago, discount } =
      req.body;
    const token = req.headers["x-access-token"] as string;

    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const sale = await prisma.$transaction(
      async (tx) => {
        let total = 0;

        // 1. validar stock
        for (const item of products) {
          const inventory = await getInventoryRepo(
            tx,
            item.productId,
            locationId,
          );

          if (!inventory || inventory.quantity < item.quantity) {
            throw new Error("insufficient stock");
          }
        }

        // 2. incrementar contador
        const location = await incrementLocationCounterRepo(tx, locationId);

        const saleNumber = location.saleCounter;
        const code = `${location.abbreviation}-${saleNumber}`;

        // 3. crear venta
        const newSale = await createSaleRepo(tx, {
          employeeId: user.id,
          locationId,
          total: 0,
          code,
          pdfUrl: `ECOZONA/SALES/${code}.pdf`,
          typeSale: metodoPago,
          transactionNumber: codigoTransaccion,
        });

        // 4. detalles + cálculo total
        for (const item of products) {
          const product = await getProductRepo(tx, item.productId);

          if (!product) throw new Error("product not found");

          const price = product.finalPrice;

          total += price * item.quantity;

          await createSaleDetailRepo(tx, {
            saleId: newSale.id,
            productId: item.productId,
            quantity: item.quantity,
            price,
          });

          await updateInventoryRepo(
            tx,
            item.productId,
            locationId,
            item.quantity,
          );
        }

        // 5. actualizar total
        await updateSaleTotalRepo(tx, newSale.id, total - discount);

        // 6. traer venta completa
        const fullSale = await tx.sale.findUnique({
          where: { id: newSale.id },
          include: {
            location: true,
            employee: true,
            details: {
              include: {
                product: true,
              },
            },
          },
        });

        return fullSale;
      },
      { timeout: 15000 },
    );

    return res.json({
      message: "Venta completada",
      sale,
    });
  } catch (err: any) {
    return res.status(500).json({
      message: err.message || "No se pudo crear la venta",
    });
  }
};

export const getSales = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const isManagement = user.level === 1 || user.level === 4;

    const data = await getSalesRepo(Number(user.locationId), isManagement);

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      message: "No se pudieron obtener las ventas",
    });
  }
};
