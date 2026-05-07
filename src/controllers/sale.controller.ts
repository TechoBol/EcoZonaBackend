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
    const {
      locationId,
      products,
      codigoTransaccion,
      metodoPago,
      discount,
    } = req.body;

    const token = req.headers["x-access-token"] as string;

    const user = jwt.verify(
      token,
      process.env.JWTSECRET!,
    ) as any;

    const sale = await prisma.$transaction(
      async (tx) => {
        let total = 0;

        // =====================================================
        // 🔥 VALIDAR STOCK
        // =====================================================
        for (const item of products) {
          const inventory = await getInventoryRepo(
            tx,
            item.productId,
            locationId,
          );

          if (
            !inventory ||
            inventory.quantity < item.quantity
          ) {
            throw new Error("insufficient stock");
          }
        }

        // =====================================================
        // 🔥 INCREMENTAR CONTADOR
        // =====================================================
        const location =
          await incrementLocationCounterRepo(
            tx,
            locationId,
          );

        const saleNumber = location.saleCounter;

        const code = `${location.abbreviation}-${saleNumber}`;

        // =====================================================
        // 🔥 CREAR VENTA
        // =====================================================
        const newSale = await createSaleRepo(tx, {
          employeeId: user.id,

          locationId,

          total: 0,

          code,

          pdfUrl: `ECOZONA/SALES/${code}.pdf`,

          typeSale: metodoPago,

          transactionNumber: codigoTransaccion,
        });

        // =====================================================
        // 🔥 DETALLES + INVENTARIO + KARDEX
        // =====================================================
        for (const item of products) {
          const product = await getProductRepo(
            tx,
            item.productId,
          );

          if (!product) {
            throw new Error("product not found");
          }

          // ==========================================
          // 🔥 INVENTARIO ACTUAL
          // ==========================================
          const inventory =
            await tx.inventory.findUnique({
              where: {
                productId_locationId: {
                  productId: item.productId,
                  locationId,
                },
              },
            });

          if (!inventory) {
            throw new Error(
              "inventory not found",
            );
          }

          // ==========================================
          // 🔥 PRECIO VENTA
          // ==========================================
          const price = product.finalPrice;

          total += price * item.quantity;

          // ==========================================
          // 🔥 DETALLE VENTA
          // ==========================================
          await createSaleDetailRepo(tx, {
            saleId: newSale.id,

            productId: item.productId,

            quantity: item.quantity,

            price,
          });

          // ==========================================
          // 🔥 DESCONTAR INVENTARIO
          // ==========================================
          await updateInventoryRepo(
            tx,
            item.productId,
            locationId,
            item.quantity,
          );

          // ==========================================
          // 🔥 MOVIMIENTO KARDEX
          // ==========================================
          await tx.stockMovement.create({
            data: {
              productId: item.productId,

              fromLocationId: locationId,

              quantity: item.quantity,

              type: "OUT",

              // 🔥 COSTO PROMEDIO REAL
              unitCost:
                inventory.averageCost ||
                product.price,

              reference: `VENTA ${code}`,
            },
          });
        }

        // =====================================================
        // 🔥 ACTUALIZAR TOTAL
        // =====================================================
        await updateSaleTotalRepo(
          tx,
          newSale.id,
          total - (discount || 0),
        );

        // =====================================================
        // 🔥 OBTENER VENTA COMPLETA
        // =====================================================
        const fullSale = await tx.sale.findUnique({
          where: {
            id: newSale.id,
          },

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
      message:
        err.message ||
        "No se pudo crear la venta",
    });
  }
};

export const getSales = async (
  req: Request,
  res: Response,
) => {
  try {
    const token = req.headers[
      "x-access-token"
    ] as string;

    const user = jwt.verify(
      token,
      process.env.JWTSECRET!,
    ) as any;

    const isManagement =
      user.level === 1 || user.level === 4;

    const data = await getSalesRepo(
      Number(user.locationId),
      isManagement,
    );

    return res.json(data);
  } catch (error) {
    console.error("❌ ERROR GET SALES:", error);

    return res.status(500).json({
      message:
        "No se pudieron obtener las ventas",
    });
  }
};