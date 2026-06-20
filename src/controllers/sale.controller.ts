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
  cancelSaleRepo,
} from "../repository/sale.repository";
import jwt from "jsonwebtoken";

export const createSale = async (req: Request, res: Response) => {
  try {
    const {
      locationId: bodyLocationId,
      products,
      codigoTransaccion,
      metodoPago,
      discount,

      customerName,
      customerPhone,
      customerDocument,
      customerAddress,
      customerNote,
    } = req.body;

    const token = req.headers["x-access-token"] as string;

    if (!token) {
      return res.status(401).json({
        message: "Token requerido",
      });
    }

    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const locationId = bodyLocationId || user.locationId;

    if (!locationId) {
      return res.status(400).json({
        message: "locationId requerido",
      });
    }

    const employeeId = user.id || user.sellerId;

    const sale = await prisma.$transaction(
      async (tx) => {
        let subtotal = 0;

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

        const location = await incrementLocationCounterRepo(tx, locationId);

        const saleNumber = location.saleCounter;

        const code = `${location.abbreviation}-${saleNumber}`;

        const type = user.sellerId ? "Online" : "Privado";

        const newSale = await createSaleRepo(tx, {
          employeeId,
          locationId,

          subtotal: 0,
          discount: 0,
          total: 0,

          code,
          pdfUrl: `ECOZONA/SALES/${code}.pdf`,

          typeSale: metodoPago,
          transactionNumber: codigoTransaccion,
          type,

          customerName,
          customerPhone,
          customerDocument,
          customerAddress,
          customerNote,
        });

        for (const item of products) {
          const product = await getProductRepo(tx, item.productId);

          if (!product) {
            throw new Error("product not found");
          }

          ///////////////////////////////////////////
          // INVENTARIO
          ///////////////////////////////////////////

          const inventory = await tx.inventory.findUnique({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId,
              },
            },
          });

          if (!inventory) {
            throw new Error("inventory not found");
          }

          ///////////////////////////////////////////
          // PRECIO
          ///////////////////////////////////////////

          const price = product.finalPrice;

          subtotal += price * item.quantity;

          ///////////////////////////////////////////
          // DETALLE
          ///////////////////////////////////////////

          await createSaleDetailRepo(tx, {
            saleId: newSale.id,

            productId: item.productId,

            quantity: item.quantity,

            price,
          });

          ///////////////////////////////////////////
          // DESCONTAR INVENTARIO
          ///////////////////////////////////////////

          await updateInventoryRepo(
            tx,
            item.productId,
            locationId,
            item.quantity,
          );

          ///////////////////////////////////////////
          // KARDEX
          ///////////////////////////////////////////

          await tx.stockMovement.create({
            data: {
              productId: item.productId,

              fromLocationId: locationId,

              quantity: item.quantity,

              type: "OUT",

              unitCost: inventory.averageCost || product.price,

              reference: `VENTA ${code}`,
            },
          });
        }

        // =====================================================
        // ACTUALIZAR TOTAL
        // =====================================================

        await updateSaleTotalRepo(tx, newSale.id, {
          subtotal,

          discount: discount || 0,

          total: subtotal - (discount || 0),
        });

        // =====================================================
        // OBTENER VENTA COMPLETA
        // =====================================================

        const fullSale = await tx.sale.findUnique({
          where: {
            id: newSale.id,
          },

          include: {
            location: true,

            employee: {
              select: {
                name: true,
                lastName: true,
              },
            },

            details: {
              include: {
                product: true,
              },
            },
          },
        });

        return fullSale;
      },
      {
        timeout: 15000,
      },
    );

    return res.json({
      message: "Venta completada",
      sale,
    });
  } catch (err: any) {
    console.error("❌ ERROR CREATE SALE:", err);

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
    console.error("❌ ERROR GET SALES:", error);

    return res.status(500).json({
      message: "No se pudieron obtener las ventas",
    });
  }
};

export const updateSalePaymentMethod = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { typeSale } = req.body;

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: Number(id) },
    });

    if (!sale) return res.status(404).json({ error: "Venta no encontrada" });

    if (sale.paymentMethodChanged) {
      return res
        .status(400)
        .json({ error: "El método de pago ya fue cambiado anteriormente" });
    }

    const updated = await prisma.sale.update({
      where: { id: Number(id) },
      data: { typeSale, paymentMethodChanged: true },
      include: {
        location: { select: { name: true } },
        employee: { select: { name: true, lastName: true } },
        details: {
          include: {
            product: {
              select: { id: true, name: true, barcode: true },
            },
          },
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Error al actualizar el método de pago" });
  }
};

export const updateSaleDate = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { date } = req.body;
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: Number(id) },
    });

    if (!sale) {
      return res.status(404).json({
        error: "Venta no encontrada",
      });
    }

    if (sale.dateChanged) {
      return res.status(400).json({
        error: "La fecha ya fue modificada anteriormente",
      });
    }

    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        error: "Fecha inválida",
      });
    }

    const updated = await prisma.sale.update({
      where: { id: Number(id) },
      data: { date: parsedDate, dateChanged: true },
      include: {
        location: { select: { name: true } },
        employee: { select: { name: true, lastName: true } },
        details: {
          include: {
            product: {
              select: { id: true, name: true, barcode: true },
            },
          },
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({
      error: "Error al actualizar la fecha",
    });
  }
};

export const cancelSale = async (req: Request, res: Response) => {
  try {
    const saleId = Number(req.params.id);

    const { reason } = req.body;
    const token = req.headers["x-access-token"] as string;

    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: "El motivo es obligatorio",
      });
    }

    const sale = await cancelSaleRepo(saleId, reason, user.id);

    return res.json(sale);
  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
    });
  }
};
