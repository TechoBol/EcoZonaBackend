import prisma from "../config/db";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

type ImportationProduct = {
  productCode: string;
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

type UpdateImportationDTO = {
  id: number;
  products: ImportationProduct[];
  file?: Express.Multer.File;
  type?: "MANUAL" | "EXCEL";
};

type ChangeStatusDTO = {
  id: number;
  status: "APPROVED" | "CANCELLED";
  resolvedById: number;
};

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const CALC_DECIMALS = 4;

const parseProductsFromExcel = (
  file: Express.Multer.File,
): ImportationProduct[] => {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  if (!rows.length) throw new Error("El archivo Excel está vacío");

  return rows.map((row) => {
    const productCode = String(row.productCode || "")
      .trim()
      .replace(/\s+/g, "");
    const quantity = Number(row.quantity || 0);
    const unitCost = Number(row.unitCost || 0);

    if (!productCode) throw new Error("Codigo inválido en el archivo Excel");
    if (quantity <= 0) throw new Error(`Cantidad inválida (${productCode})`);
    if (unitCost < 0) throw new Error(`Costo inválido (${productCode})`);

    return { productCode, quantity, unitCost };
  });
};

// ─────────────────────────────────────────────
// INVENTORY / PRICING (solo se ejecutan al APROBAR)
// ─────────────────────────────────────────────

const upsertInventory = async (
  tx: Prisma.TransactionClient,
  productId: number,
  locationId: number,
  quantity: number,
  unitCost: number,
) => {
  const inventory = await tx.inventory.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });

  if (!inventory) {
    await tx.inventory.create({
      data: {
        productId,
        locationId,
        quantity,
        averageCost: round(unitCost, CALC_DECIMALS),
      },
    });
  } else {
    const totalActual = inventory.quantity * inventory.averageCost;
    const totalNuevo = quantity * unitCost;
    const nuevaCantidad = inventory.quantity + quantity;
    const nuevoPromedio =
      nuevaCantidad > 0
        ? round((totalActual + totalNuevo) / nuevaCantidad, CALC_DECIMALS)
        : round(unitCost, CALC_DECIMALS);

    await tx.inventory.update({
      where: { productId_locationId: { productId, locationId } },
      data: {
        quantity: { increment: quantity },
        averageCost: nuevoPromedio,
      },
    });
  }
};

const recalculateGlobalPrice = async (
  tx: Prisma.TransactionClient,
  productId: number,
  newQuantity: number,
  newUnitCost: number,
) => {
  const inventories = await tx.inventory.findMany({
    where: { productId, quantity: { gt: 0 } },
  });

  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Producto no encontrado");

  const currentGlobalStock =
    inventories.reduce((acc, inv) => acc + inv.quantity, 0) - newQuantity;
  const currentGlobalCost = product.price;
  const newGlobalStock = currentGlobalStock + newQuantity;

  const newGlobalPrice = round(
    newGlobalStock > 0
      ? (currentGlobalStock * currentGlobalCost + newQuantity * newUnitCost) /
          newGlobalStock
      : newUnitCost,
    CALC_DECIMALS,
  );

  const IVA = 0.1494;
  const costWithIVA = newGlobalPrice * (1 + IVA);
  const newFinalPrice = round(
    costWithIVA * (1 + product.porcentajeGanancia / 100),
    CALC_DECIMALS,
  );

  await tx.product.update({
    where: { id: productId },
    data: { price: newGlobalPrice, finalPrice: newFinalPrice },
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
    products.map(async ({ productCode, quantity, unitCost }) => {
      const product = await tx.product.findUnique({ where: { productCode } });
      if (!product) throw new Error(`PRODUCT_NOT_FOUND:${productCode}`);

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
    }),
  );
};

// ─────────────────────────────────────────────
// SELECT REUTILIZABLE
// ─────────────────────────────────────────────

const importationListSelect = {
  id: true,
  code: true,
  type: true,
  fileName: true,
  fileUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  employee: {
    select: { id: true, name: true, lastName: true },
  },
  resolvedBy: {
    select: { id: true, name: true, lastName: true },
  },
  location: {
    select: { id: true, name: true },
  },
  _count: {
    select: { items: true },
  },
};

// ─────────────────────────────────────────────
// CREAR — solo guarda en DRAFT, no toca inventario
// ─────────────────────────────────────────────

export const createImportationRepo = async ({
  code,
  type,
  file,
  products = [],
  employeeId,
  locationId,
}: CreateImportationDTO) => {
  const parsedProducts: ImportationProduct[] =
    type === "EXCEL" ? parseProductsFromExcel(file!) : products;

  if (!parsedProducts.length) throw new Error("No hay productos para procesar");

  return prisma.$transaction(
    async (tx) => {
      // Verificar que todos los productos existen antes de guardar
      await Promise.all(
        parsedProducts.map(async ({ productCode }) => {
          const product = await tx.product.findUnique({
            where: { productCode },
          });
          if (!product) throw new Error(`PRODUCT_NOT_FOUND:${productCode}`);
        }),
      );

      const importation = await tx.importation.create({
        data: {
          code,
          type,
          status: "DRAFT",
          fileName: type === "EXCEL" ? file!.originalname : null,
          employeeId,
          locationId,
          items: {
            create: await Promise.all(
              parsedProducts.map(
                async ({ productCode, quantity, unitCost }) => {
                  const product = await tx.product.findUnique({
                    where: { productCode },
                  });
                  return { productId: product!.id, quantity, unitCost };
                },
              ),
            ),
          },
        },
        select: importationListSelect,
      });

      return importation;
    },
    { timeout: 30000 },
  );
};

// ─────────────────────────────────────────────
// ACTUALIZAR — solo si está en DRAFT
// ─────────────────────────────────────────────

export const updateImportationRepo = async ({
  id,
  products,
  file,
  type,
}: UpdateImportationDTO) => {
  const importation = await prisma.importation.findUnique({ where: { id } });

  if (!importation) throw new Error("Importación no encontrada");
  if (importation.status !== "DRAFT") throw new Error("INVALID_STATUS");

  const parsedProducts: ImportationProduct[] =
    file && type === "EXCEL" ? parseProductsFromExcel(file) : products;

  if (!parsedProducts.length) throw new Error("No hay productos para procesar");

  return prisma.$transaction(
    async (tx) => {
      // Verificar productos
      await Promise.all(
        parsedProducts.map(async ({ productCode }) => {
          const product = await tx.product.findUnique({
            where: { productCode },
          });
          if (!product) throw new Error(`PRODUCT_NOT_FOUND:${productCode}`);
        }),
      );

      // Reemplazar todos los items
      await tx.importationItem.deleteMany({ where: { importationId: id } });

      const updatedImportation = await tx.importation.update({
        where: { id },
        data: {
          ...(file && type === "EXCEL" ? { fileName: file.originalname } : {}),
          items: {
            create: await Promise.all(
              parsedProducts.map(
                async ({ productCode, quantity, unitCost }) => {
                  const product = await tx.product.findUnique({
                    where: { productCode },
                  });
                  return { productId: product!.id, quantity, unitCost };
                },
              ),
            ),
          },
        },
        select: importationListSelect,
      });

      return updatedImportation;
    },
    { timeout: 30000 },
  );
};

// ─────────────────────────────────────────────
// CAMBIAR ESTADO — APPROVED ejecuta la importación / CANCELLED la bloquea
// ─────────────────────────────────────────────

export const changeImportationStatusRepo = async ({
  id,
  status,
  resolvedById,
}: ChangeStatusDTO) => {
  const importation = await prisma.importation.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });

  if (!importation) throw new Error("Importación no encontrada");
  if (importation.status !== "DRAFT") throw new Error("INVALID_STATUS");

  return prisma.$transaction(
    async (tx) => {
      if (status === "APPROVED") {
        // Aplicar inventario y movimientos
        const products: ImportationProduct[] = importation.items.map((item) => {
          if (!item.product.productCode) {
            throw new Error(`PRODUCT_WITHOUT_CODE:${item.product.id}`);
          }

          return {
            productCode: item.product.productCode,
            quantity: item.quantity,
            unitCost: item.unitCost,
          };
        });

        console.log("IMPORTATION LOCATION:", importation.locationId);
        console.log("IMPORTATION CODE:", importation.code);
        await processProducts(
          tx,
          products,
          id,
          importation.locationId,
          importation.code,
        );
      }

      const updated = await tx.importation.update({
        where: { id },
        data: {
          status,
          resolvedById,
          resolvedAt: new Date(),
        },
        select: importationListSelect,
      });

      return updated;
    },
    { timeout: 30000 },
  );
};

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const getImportationsRepo = async () => {
  return prisma.importation.findMany({
    select: importationListSelect,
    orderBy: { createdAt: "desc" },
  });
};

export const getImportationByIdRepo = async (id: number) => {
  return prisma.importation.findUnique({
    where: { id },
    include: {
      employee: {
        select: { id: true, name: true, lastName: true },
      },
      resolvedBy: {
        select: { id: true, name: true, lastName: true },
      },
      location: true,
      items: {
        include: {
          product: {
            select: { id: true, name: true, productCode: true },
          },
        },
      },
    },
  });
};
