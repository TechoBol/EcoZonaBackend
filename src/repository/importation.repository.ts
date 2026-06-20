import prisma from "../config/db";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

type ImportationProduct = {
  barcode: string;
  quantity: number;
  unitCost: number;
};

type CreateImportationDTO = {
  code: string;
  type: "MANUAL" | "EXCEL";
  file?: Express.Multer.File;
  products?: ImportationProduct[];
  employeeId: number;
  locationId: number;
};

const upsertInventory = async (
  tx: Prisma.TransactionClient,
  productId: number,
  locationId: number,
  quantity: number,
  unitCost: number,
) => {
  const inventory = await tx.inventory.findUnique({
    where: {
      productId_locationId: { productId, locationId },
    },
  });

  if (!inventory) {
    await tx.inventory.create({
      data: {
        productId,
        locationId,
        quantity,
        averageCost: unitCost,
      },
    });
  } else {
    const totalActual = inventory.quantity * inventory.averageCost;
    const totalNuevo = quantity * unitCost;
    const nuevaCantidad = inventory.quantity + quantity;
    const nuevoPromedio =
      nuevaCantidad > 0 ? (totalActual + totalNuevo) / nuevaCantidad : unitCost;

    await tx.inventory.update({
      where: {
        productId_locationId: { productId, locationId },
      },
      data: {
        quantity: { increment: quantity },
        averageCost: nuevoPromedio,
      },
    });
  }
};

const parseProductsFromExcel = (
  file: Express.Multer.File,
): ImportationProduct[] => {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  if (!rows.length) {
    throw new Error("El archivo Excel está vacío");
  }

  return rows.map((row) => {
    const barcode = String(row.barcode || "")
      .trim()
      .replace(/\s+/g, "");
    const quantity = Number(row.quantity || 0);
    const unitCost = Number(row.unitCost || 0);

    if (!barcode) throw new Error("Barcode inválido en el archivo Excel");
    if (quantity <= 0) throw new Error(`Cantidad inválida (${barcode})`);
    if (unitCost < 0) throw new Error(`Costo inválido (${barcode})`);

    return { barcode, quantity, unitCost };
  });
};

const processProducts = async (
  tx: Prisma.TransactionClient,
  products: ImportationProduct[],
  importationId: number,
  locationId: number,
  code: string,
) => {
  await Promise.all(
    products.map(async ({ barcode, quantity, unitCost }) => {
      const product = await tx.product.findUnique({ where: { barcode } });

      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND:${barcode}`);
      }

      await upsertInventory(tx, product.id, locationId, quantity, unitCost);

      await recalculateGlobalPrice(tx, product.id, quantity, unitCost);

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          toLocationId: locationId,
          quantity,
          type: "IN",
          unitCost,
          reference: `IMPORTACION ${(code || "").toUpperCase()}`,
          importationId,
        },
      });

      await tx.importationItem.create({
        data: {
          importationId,
          productId: product.id,
          quantity,
          unitCost,
        },
      });
    }),
  );
};

const recalculateGlobalPrice = async (
  tx: Prisma.TransactionClient,
  productId: number,
  newQuantity: number,
  newUnitCost: number,
) => {
  const inventories = await tx.inventory.findMany({
    where: {
      productId,
      quantity: {
        gt: 0,
      },
    },
  });

  const product = await tx.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new Error("Producto no encontrado");
  }

  const currentGlobalStock =
    inventories.reduce((acc, inv) => acc + inv.quantity, 0) - newQuantity;

  const currentGlobalCost = product.price;

  const newGlobalStock = currentGlobalStock + newQuantity;

  const newGlobalPrice =
    newGlobalStock > 0
      ? (currentGlobalStock * currentGlobalCost + newQuantity * newUnitCost) /
        newGlobalStock
      : newUnitCost;

  const IVA = 0.1494;

  const costWithIVA = newGlobalPrice * (1 + IVA);

  const newFinalPrice = costWithIVA * (1 + product.porcentajeGanancia / 100);
  
  await tx.product.update({
    where: { id: productId },
    data: {
      price: Number(newGlobalPrice.toFixed(2)),
      finalPrice: Number(newFinalPrice.toFixed(2)),
    },
  });
};

export const createImportationRepo = async ({
  code,
  type,
  file,
  products = [],
  employeeId,
  locationId,
}: CreateImportationDTO) => {
  return prisma.$transaction(
    async (tx) => {
      const parsedProducts: ImportationProduct[] =
        type === "EXCEL" ? parseProductsFromExcel(file!) : products;

      if (!parsedProducts.length) {
        throw new Error("No hay productos para procesar");
      }

      const importation = await tx.importation.create({
        data: {
          code,
          type,
          fileName: type === "EXCEL" ? file!.originalname : null,
          employeeId,
          locationId,
        },
      });

      await processProducts(
        tx,
        parsedProducts,
        importation.id,
        locationId,
        code,
      );

      // Devolver la importación completa con los mismos includes que getImportationsRepo
      return tx.importation.findUnique({
        where: { id: importation.id },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              lastName: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      });
    },
    { timeout: 30000 },
  );
};

export const getImportationsRepo = async (locationId: number) => {
  return prisma.importation.findMany({
    where: { locationId },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          lastName: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: { items: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getImportationByIdRepo = async (id: number) => {
  return prisma.importation.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          lastName: true,
        },
      },
      location: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              barcode: true,
            },
          },
        },
      },
    },
  });
};
