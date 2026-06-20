import { Request, Response } from "express";
import prisma from "../config/db";

import {
  getProductsRepo,
  getProductByIdRepo,
  updateProductRepo,
  deleteProductRepo,
  getKardexRepo,
  getKardexRepository,
  crossInventoryRepo,
  getInventoryCrossesRepo,
  getPublicProductsRepo,
  getValuedInventoryRepo,
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
      lineId,
      brandName,
    } = req.body;

    console.log("📥 CREATE PRODUCT BODY:", req.body);

    // =====================================================
    // 🔥 VALIDACIONES
    // =====================================================

    if (
      !name ||
      !barcode ||
      price == null ||
      finalPrice == null ||
      locationId == null ||
      !lineId ||
      !brandName
    ) {
      return res.status(400).json({
        message: "Por favor, completa los campos requeridos",
      });
    }

    // =====================================================
    // 🔥 VALIDAR LÍNEA
    // =====================================================

    const line = await prisma.line.findUnique({
      where: {
        id: Number(lineId),
      },
    });

    if (!line) {
      return res.status(400).json({
        message: "Línea inválida",
      });
    }

    // =====================================================
    // 🔥 VALIDAR MARCA
    // =====================================================

    const brands = (line.brands as string[]) || [];

    const isValidBrand = brands.some(
      (b) => b.toLowerCase().trim() === brandName.toLowerCase().trim(),
    );

    if (!isValidBrand) {
      return res.status(400).json({
        message: "La marca no pertenece a la línea",
      });
    }

    // =====================================================
    // 🔥 TRANSACCIÓN
    // =====================================================

    const result = await prisma.$transaction(async (tx) => {
      // =====================================================
      // 🔥 CREAR PRODUCTO
      // =====================================================

      const product = await tx.product.create({
        data: {
          name: name.trim().toUpperCase(),
          description,
          barcode: barcode.trim(),
          imageUrl,
          price: Number(price),
          finalPrice: Number(finalPrice),
          lineId: Number(lineId),
          brandName: brandName.trim(),
        },
      });

      console.log("✅ Producto creado:", product.id);

      // =====================================================
      // 🔥 CREAR INVENTARIO
      // =====================================================

      await tx.inventory.create({
        data: {
          productId: product.id,
          locationId: Number(locationId),

          quantity: Number(stock) || 0,

          // 🔥 COSTO PROMEDIO INICIAL
          averageCost: Number(price),
        },
      });

      console.log("📦 Inventario creado");

      // =====================================================
      // 🔥 CREAR MOVIMIENTO INICIAL
      // =====================================================

      if (Number(stock) > 0) {
        await tx.stockMovement.create({
          data: {
            productId: product.id,

            // 🔥 entra al almacén/sucursal
            toLocationId: Number(locationId),

            quantity: Number(stock),

            // 🔥 movimiento ingreso
            type: "IN",

            // 🔥 COSTO HISTÓRICO
            unitCost: Number(price),

            // 🔥 REFERENCIA
            reference: "STOCK INICIAL",
          },
        });

        console.log("🧾 Movimiento inicial creado");
      }

      return product;
    });

    console.log("🎉 Producto registrado correctamente");

    return res.status(201).json(result);
  } catch (err: any) {
    console.error("❌ ERROR CREATE PRODUCT:", err);

    // =====================================================
    // 🔥 PRODUCTO DUPLICADO
    // =====================================================

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

    const isManagement = user.level === 1 || user.level === 4;

    const products = await getProductsRepo(
      Number(user.locationId),
      isManagement,
    );

    return res.json(products);
  } catch {
    return res
      .status(500)
      .json({ message: "No se pudieron obtener los productos" });
  }
};

export const getPublicProducts = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const products = await getPublicProductsRepo(
      Number(user.locationId),
    );

    return res.json(products);
  } catch {
    return res
      .status(500)
      .json({ message: "No se pudieron obtener los productos" });
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

    const {
      name,
      description,
      barcode,
      imageUrl,
      price,
      finalPrice,
      stock,
      locationId,
      lineId,
      brandName,
      inventoryEdited,
    } = req.body;

    // ==========================================
    // 🔎 VALIDACIONES
    // ==========================================
    if (!name || !barcode || !lineId || !brandName) {
      return res.status(400).json({
        message: "Campos incompletos",
      });
    }

    // 🔎 VALIDAR LÍNEA
    const line = await prisma.line.findUnique({
      where: { id: Number(lineId) },
    });

    if (!line) {
      return res.status(400).json({
        message: "Línea inválida",
      });
    }

    // 🔎 VALIDAR MARCA
    const brands = (line.brands as string[]) || [];

    const isValidBrand = brands.some(
      (b) => b.toLowerCase().trim() === brandName.toLowerCase().trim(),
    );

    if (!isValidBrand) {
      return res.status(400).json({
        message: "Marca inválida",
      });
    }

    // ==========================================
    // 🔥 UPDATE
    // ==========================================
    const updated = await updateProductRepo(id, {
      name,
      description,
      barcode,
      imageUrl,
      price: Number(price),
      finalPrice: Number(finalPrice),
      lineId: Number(lineId),
      brandName: brandName.trim(),
      stock: stock !== undefined && stock !== null ? Number(stock) : undefined,
      locationId: locationId ? Number(locationId) : undefined,
      inventoryEdited,
    });

    return res.json(updated);
  } catch (error) {
    console.error("❌ Error updateProduct:", error);

    return res.status(500).json({
      message: "No se pudo actualizar el producto",
    });
  }
};

// DELETE
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await deleteProductRepo(id);

    return res.json({ message: "Producto eliminado" });
  } catch {
    return res.status(500).json({ message: "No se pudo eliminar el producto" });
  }
};

export const getKardex = async (req: Request, res: Response) => {
  try {
    console.log("📥 BODY:", req.body);

    const kardex = await getKardexRepo(req.body);

    console.log("📤 Enviando respuesta...");

    return res.status(200).json(kardex);
  } catch (error) {
    console.error("❌ Error en kardex:", error);

    return res.status(500).json({
      message: "Error al generar kardex",
    });
  }
};

export const getKardexPro = async (req: Request, res: Response) => {
  try {
    const data = await getKardexRepository(req.body);

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error: any) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      message: error.message || "Error obteniendo kardex",
    });
  }
};

export const crossInventory = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;
    const {
      originProductCode,
      destinationProductCode,
      quantity,
      locationId,
      observacion,
    } = req.body;

    if (
      !originProductCode ||
      !destinationProductCode ||
      !quantity ||
      !locationId
    ) {
      return res.status(400).json({
        message: "Datos incompletos",
      });
    }

    const result = await crossInventoryRepo({
      user: user.id,
      originProductCode: Number(originProductCode),
      destinationProductCode: Number(destinationProductCode),
      quantity: Number(quantity),
      locationId: Number(locationId),
      observacion,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error(error);

    return res.status(400).json({
      message: error.message,
    });
  }
};

export const getInventoryCrosses = async (
  req: Request,
  res: Response,
) => {
  try {
    const token = req.headers["x-access-token"] as string;

    const user = jwt.verify(
      token,
      process.env.JWTSECRET!,
    ) as any;

    const isManagement =
      user.level === 1 ||
      user.level === 4;

    const crosses =
      await getInventoryCrossesRepo(
        Number(user.locationId),
        isManagement,
      );

    return res.json(crosses);
  } catch (error) {
    return res.status(500).json({
      message:
        "No se pudieron obtener los cruces",
    });
  }
};

export const getValuedInventory = async (
  req: Request,
  res: Response,
) => {
  try {
    const {
      locationId,
      productId,
      lineId,
      brand,
      hasta,
    } = req.body;

    const inventory =
      await getValuedInventoryRepo(
        locationId && Number(locationId) > 0
          ? Number(locationId)
          : undefined,

        productId && Number(productId) > 0
          ? Number(productId)
          : undefined,

        lineId && Number(lineId) > 0
          ? Number(lineId)
          : undefined,

        brand && brand !== "TODAS"
          ? brand
          : undefined,

        hasta
          ? new Date(
              new Date(hasta).setHours(
                23,
                59,
                59,
                999,
              ),
            )
          : undefined,
      );

    return res.json(inventory);
  } catch (error) {
    console.error(
      "ERROR INVENTARIO VALORADO:",
      error,
    );

    return res.status(500).json({
      message:
        "No se pudo generar el inventario valorado",
    });
  }
};