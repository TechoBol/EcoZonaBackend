import prisma from "../config/db";

type CreateProductDTO = {
  name: string;
  description?: string;
  barcode: string;
  imageUrl?: string;
  price: number;
  finalPrice: number;
  lineId: number;
  brandName: string;
};

// 🔥 CREAR PRODUCTO
export const createProductRepo = async (data: CreateProductDTO) => {
  return prisma.product.create({
    data,
  });
};

// 🔥 GET ALL
export const getProductsRepo = async (
  locationId: number,
  isManagement: boolean,
) => {
  if (isManagement) {
    const products = await prisma.product.findMany({
      where: { isVisible: true },
      include: {
        line: true,
        inventories: {
          include: {
            location: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return products
      .map((p) => ({
        ...p,
        stockTotal: p.inventories.reduce((acc, inv) => acc + inv.quantity, 0),
        inventories: p.inventories.map((inv) => ({
          locationId: inv.locationId,
          locationName: inv.location.name,
          quantity: inv.quantity,
        })),
      }))
      .sort((a, b) => b.stockTotal - a.stockTotal);
  }

  const products = await prisma.product.findMany({
    where: { isVisible: true },
    include: {
      line: true,
      inventories: {
        where: { locationId },
      },
    },
  });

  return products.sort((a, b) => {
    const stockA = a.inventories[0]?.quantity || 0;
    const stockB = b.inventories[0]?.quantity || 0;
    return stockB - stockA;
  });
};

export const getProductByIdRepo = async (id: number) => {
  return prisma.product.findUnique({
    where: { id },
    include: {
      line: true,
      inventories: true,
    },
  });
};

// 🔥 UPDATE
export const updateProductRepo = async (id: number, data: any) => {
  const { stock, locationId, ...productData } = data;

  return prisma.$transaction(async (tx) => {
    // ==========================================
    // 🔎 PRODUCTO ACTUAL
    // ==========================================
    const currentProduct = await tx.product.findUnique({
      where: { id },
    });

    if (!currentProduct) {
      throw new Error("Producto no encontrado");
    }

    // ==========================================
    // 🔥 UPDATE PRODUCTO
    // ==========================================
    await tx.product.update({
      where: { id },
      data: {
        name: productData.name,
        description: productData.description,
        barcode: productData.barcode,
        price: productData.price,
        finalPrice: productData.finalPrice,
        imageUrl: productData.imageUrl,
        lineId: productData.lineId,
        brandName: productData.brandName,
      },
    });

    // ==========================================
    // 🔥 CONTROL INVENTARIO
    // ==========================================
    if (stock !== undefined && locationId) {
      // =====================================================
      // 🔥 INVENTARIO ACTUAL
      // =====================================================

      const inventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: {
            productId: id,
            locationId,
          },
        },
      });

      // =====================================================
      // 🔥 SI NO EXISTE INVENTARIO
      // =====================================================

      if (!inventory) {
        await tx.inventory.create({
          data: {
            productId: id,
            locationId,

            quantity: stock,

            averageCost: productData.price,
          },
        });

        // 🔥 MOVIMIENTO
        await tx.stockMovement.create({
          data: {
            productId: id,

            toLocationId: locationId,

            quantity: stock,

            type: "IN",

            unitCost: productData.price,

            reference: "NUEVO INGRESO",
          },
        });
      } else {
        // =====================================================
        // 🔥 PONDERADO
        // =====================================================

        const cantidadActual = inventory.quantity;

        const costoActual = inventory.averageCost;

        const totalActual = cantidadActual * costoActual;

        const totalNuevo = stock * productData.price;

        const nuevaCantidad = cantidadActual + stock;

        const nuevoPromedio =
          nuevaCantidad > 0
            ? (totalActual + totalNuevo) / nuevaCantidad
            : productData.price;

        // =====================================================
        // 🔥 ACTUALIZAR INVENTARIO
        // =====================================================

        await tx.inventory.update({
          where: {
            productId_locationId: {
              productId: id,
              locationId,
            },
          },

          data: {
            quantity: {
              increment: stock,
            },

            averageCost: nuevoPromedio,
          },
        });

        // =====================================================
        // 🔥 MOVIMIENTO HISTÓRICO
        // =====================================================

        await prisma.stockMovement.create({
          data: {
            productId: id,

            toLocationId: locationId,

            quantity: stock,

            type: "IN",

            unitCost: productData.price,

            reference: "REPOSICION STOCK",
          },
        });
      }
    }

    // ==========================================
    // 🔥 RETORNO
    // ==========================================
    return tx.product.findUnique({
      where: { id },
      include: {
        line: true,
        inventories: {
          include: {
            location: true,
          },
        },
      },
    });
  });
};

// 🔥 DELETE
export const deleteProductRepo = async (id: number) => {
  return prisma.product.update({
    where: { id },
    data: { isVisible: false },
  });
};

export const getKardexRepo = async ({
  productId,
  fromDate,
  toDate,
  locationId,
  linea,
  marca
}: {
  productId?: number | null;
  fromDate?: string;
  toDate?: string;
  locationId?: number | null;
  linea?:number
  marca?:string;
}) => {
  console.log("📥 INPUT:", {
    productId,
    fromDate,
    toDate,
    locationId,
  });

  ////////////////////////////////////////////////////////////
  // 🔥 FECHAS
  ////////////////////////////////////////////////////////////

  const parseDate = (dateStr?: string, end = false) => {
    if (!dateStr) return null;

    const d = new Date(end ? `${dateStr}T23:59:59` : `${dateStr}T00:00:00`);

    return isNaN(d.getTime()) ? null : d;
  };

  const from = parseDate(fromDate);
  const to = parseDate(toDate, true);

  ////////////////////////////////////////////////////////////
  // 🔥 PRODUCTOS
  ////////////////////////////////////////////////////////////

  const products = await prisma.product.findMany({
    where: {
      isVisible: true,

      ...(productId && {
        id: productId,
      }),

      ...(linea && {
        lineId: linea,
      }),

       ...(marca &&
      marca.trim() !== "" && {
        brandName: {
          contains: marca,
          mode: "insensitive",
        },
      }),
    },

    include: {
      line: true,
    },
  });

  ////////////////////////////////////////////////////////////
  // 🔥 MOVIMIENTOS
  ////////////////////////////////////////////////////////////

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(productId && {
        productId,
      }),

      ...(locationId && {
        OR: [
          {
            fromLocationId: locationId,
          },
          {
            toLocationId: locationId,
          },
        ],
      }),

      ...(from &&
        to && {
          createdAt: {
            gte: from,
            lte: to,
          },
        }),
    },

    include: {
      product: {
        include: {
          line: true,
        },
      },

      transfer: true,
    },

    orderBy: {
      createdAt: "asc",
    },
  });

  const resultado: any[] = [];

  ////////////////////////////////////////////////////////////
  // 🔥 RECORRER PRODUCTOS
  ////////////////////////////////////////////////////////////

  for (const product of products) {
    //////////////////////////////////////////////////////////
    // 🔥 INVENTARIO ACTUAL
    //////////////////////////////////////////////////////////

    const inventory = await prisma.inventory.findMany({
      where: {
        productId: product.id,

        ...(locationId && {
          locationId,
        }),
      },
    });

    const stockActual = inventory.reduce(
      (acc, inv) => acc + inv.quantity,
      0,
    );

    const inventoryCost =
      inventory.length > 0
        ? inventory.reduce((acc, inv) => acc + inv.averageCost, 0) /
          inventory.length
        : product.price;

    //////////////////////////////////////////////////////////
    // 🔥 MOVIMIENTOS PRODUCTO
    //////////////////////////////////////////////////////////

    const movimientosProducto: any[] = [];

    for (const mov of movements.filter((m) => m.productId === product.id)) {
      let entrada = 0;
      let salida = 0;
      let detalle = "";

      ////////////////////////////////////////////////////////
      // 🔥 INGRESOS
      ////////////////////////////////////////////////////////

      if (mov.type === "IN") {
        entrada = mov.quantity;

        detalle = mov.reference || "COMPRA / IMPORTACIÓN";
      }

      ////////////////////////////////////////////////////////
      // 🔥 SALIDAS
      ////////////////////////////////////////////////////////

      if (mov.type === "OUT") {
        salida = mov.quantity;

        detalle = mov.reference || "SALIDA";
      }

      ////////////////////////////////////////////////////////
      // 🔥 TRANSFERENCIAS
      ////////////////////////////////////////////////////////

      if (mov.type === "TRANSFER") {
        const transferCode =
          mov.transfer?.transferCode || "TRANSFERENCIA";

        //////////////////////////////////////////////////////
        // 🔥 FILTRANDO POR SUCURSAL
        //////////////////////////////////////////////////////

        if (locationId) {
          ////////////////////////////////////////////////
          // 🔥 ENTRADA A SUCURSAL
          ////////////////////////////////////////////////

          if (mov.toLocationId === locationId) {
            entrada = mov.quantity;

            detalle = `TRANSFERENCIA ENTRADA ${transferCode}`;
          }

          ////////////////////////////////////////////////
          // 🔥 SALIDA DE SUCURSAL
          ////////////////////////////////////////////////

          if (mov.fromLocationId === locationId) {
            salida = mov.quantity;

            detalle = `TRANSFERENCIA SALIDA ${transferCode}`;
          }
        } else {
          //////////////////////////////////////////////////
          // 🔥 TODAS LAS SUCURSALES
          // SOLO MOSTRAR SALIDA PARA EVITAR DUPLICAR
          //////////////////////////////////////////////////

          salida = mov.quantity;

          detalle = `TRANSFERENCIA SALIDA ${transferCode}`;
        }
      }

      ////////////////////////////////////////////////////////
      // 🔥 AGREGAR MOVIMIENTO
      ////////////////////////////////////////////////////////

      movimientosProducto.push({
        fecha: mov.createdAt,

        detalle,

        entrada,
        salida,

        costoUnitario: mov.unitCost || 0,
      });
    }

    //////////////////////////////////////////////////////////
    // 🔥 ORDENAR
    //////////////////////////////////////////////////////////

    movimientosProducto.sort(
      (a, b) =>
        new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    );

    //////////////////////////////////////////////////////////
    // 🔥 SIN MOVIMIENTOS
    //////////////////////////////////////////////////////////

    if (movimientosProducto.length === 0) {
      resultado.push({
        producto: product.name,

        barcode: product.barcode,

        linea: product.line?.name || "-",

        marca: product.brandName || "-",

        kardex: [
          {
            fecha: new Date(),

            detalle: "SIN MOVIMIENTOS",

            entrada: 0,
            salida: 0,

            saldoCantidad: stockActual,

            costoUnitario: inventoryCost,

            entradaTotal: 0,

            salidaTotal: 0,

            saldoTotal: stockActual * inventoryCost,
          },
        ],
      });

      continue;
    }

    //////////////////////////////////////////////////////////
    // 🔥 KARDEX
    //////////////////////////////////////////////////////////

    let saldoCantidad = 0;

    let saldoTotal = 0;

    let costoPromedio = 0;

    const kardexProducto: any[] = [];

    for (const mov of movimientosProducto) {
      ////////////////////////////////////////////////////////
      // 🔥 TOTAL ENTRADA
      ////////////////////////////////////////////////////////

      const entradaTotal = mov.entrada * mov.costoUnitario;

      ////////////////////////////////////////////////////////
      // 🔥 ENTRADAS
      ////////////////////////////////////////////////////////

      if (mov.entrada > 0) {
        saldoTotal += entradaTotal;

        saldoCantidad += mov.entrada;

        costoPromedio =
          saldoCantidad > 0
            ? saldoTotal / saldoCantidad
            : mov.costoUnitario;
      }

      ////////////////////////////////////////////////////////
      // 🔥 SALIDAS
      ////////////////////////////////////////////////////////

      let salidaTotal = 0;

      if (mov.salida > 0) {
        salidaTotal = mov.salida * costoPromedio;

        saldoCantidad -= mov.salida;

        saldoTotal -= salidaTotal;
      }

      ////////////////////////////////////////////////////////
      // 🔥 REGISTRO KARDEX
      ////////////////////////////////////////////////////////

      kardexProducto.push({
        fecha: mov.fecha,

        detalle: mov.detalle,

        entrada: mov.entrada,

        salida: mov.salida,

        saldoCantidad,

        costoUnitario:
          mov.entrada > 0
            ? mov.costoUnitario
            : costoPromedio,

        entradaTotal,

        salidaTotal,

        saldoTotal,
      });
    }

    //////////////////////////////////////////////////////////
    // 🔥 RESULTADO PRODUCTO
    //////////////////////////////////////////////////////////

    resultado.push({
      producto: product.name,

      barcode: product.barcode,

      linea: product.line?.name || "-",

      marca: product.brandName || "-",

      kardex: kardexProducto,
    });
  }

  console.log(
    "✅ Kardex generado:",
    resultado.length,
    "productos",
  );

  return resultado;
};
