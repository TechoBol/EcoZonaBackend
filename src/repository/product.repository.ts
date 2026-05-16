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
  const { stock, locationId, inventoryEdited, ...productData } = data;

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
    if (inventoryEdited) {
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

          await tx.stockMovement.create({
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
  marca,
}: {
  productId?: number | null;
  fromDate?: string;
  toDate?: string;
  locationId?: number | null;
  linea?: number;
  marca?: string;
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
      fromLocation: true,
      toLocation: true,
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

    const stockActual = inventory.reduce((acc, inv) => acc + inv.quantity, 0);

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

      let codigoMovimiento = "";

      ////////////////////////////////////////////////////////
      // 🔥 INGRESOS
      ////////////////////////////////////////////////////////

      if (mov.type === "IN") {
        entrada = mov.quantity;

        detalle = (mov.reference || "COMPRA / IMPORTACIÓN").toUpperCase();
      }

      ////////////////////////////////////////////////////////
      // 🔥 SALIDAS
      ////////////////////////////////////////////////////////

      if (mov.type === "OUT") {
        salida = mov.quantity;

        detalle = (mov.reference || "SALIDA").toUpperCase();
      }

      ////////////////////////////////////////////////////////
      // 🔥 TRANSFERENCIAS
      ////////////////////////////////////////////////////////

      if (mov.type === "TRANSFER") {
        const transferCode = mov.transfer?.transferCode || `TR-${mov.id}`;

        const fromName = mov.fromLocation?.name?.toUpperCase() || "ORIGEN";

        const toName = mov.toLocation?.name?.toUpperCase() || "DESTINO";

        codigoMovimiento = transferCode;

        //////////////////////////////////////////////////////
        // 🔥 FILTRANDO POR SUCURSAL
        //////////////////////////////////////////////////////

        if (locationId) {
          //////////////////////////////////////////////////
          // 🔥 ENTRADA
          //////////////////////////////////////////////////

          if (mov.toLocationId === locationId) {
            entrada = mov.quantity;

            detalle = (
              `TRANSFERENCIA ENTRADA ${transferCode} ` +
              `${fromName} → ${toName}`
            ).toUpperCase();
          }

          //////////////////////////////////////////////////
          // 🔥 SALIDA
          //////////////////////////////////////////////////

          if (mov.fromLocationId === locationId) {
            salida = mov.quantity;

            detalle = (
              `TRANSFERENCIA SALIDA ${transferCode} ` +
              `${fromName} → ${toName}`
            ).toUpperCase();
          }
        } else {
          //////////////////////////////////////////////////
          // 🔥 GLOBAL
          //////////////////////////////////////////////////

          movimientosProducto.push({
            fecha: mov.createdAt,

            codigoMovimiento: transferCode,

            detalle: (
              `TRANSFERENCIA SALIDA ${transferCode} ` +
              `${fromName} → ${toName}`
            ).toUpperCase(),

            entrada: 0,
            salida: mov.quantity,

            costoUnitario: mov.unitCost || 0,
          });

          movimientosProducto.push({
            fecha: mov.createdAt,

            codigoMovimiento: transferCode,

            detalle: (
              `TRANSFERENCIA ENTRADA ${transferCode} ` +
              `${fromName} → ${toName}`
            ).toUpperCase(),

            entrada: mov.quantity,
            salida: 0,

            costoUnitario: mov.unitCost || 0,
          });

          continue;
        }
      }

      ////////////////////////////////////////////////////////
      // 🔥 AGREGAR MOVIMIENTO
      ////////////////////////////////////////////////////////

      movimientosProducto.push({
        fecha: mov.createdAt,

        codigoMovimiento,

        detalle: detalle.toUpperCase(),

        entrada,
        salida,

        costoUnitario: mov.unitCost || 0,
      });
    }

    //////////////////////////////////////////////////////////
    // 🔥 ORDENAR
    //////////////////////////////////////////////////////////

    movimientosProducto.sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
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

            codigoMovimiento: "",

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
      // 🔥 COSTO REAL DEL MOVIMIENTO
      ////////////////////////////////////////////////////////

      let costoMovimiento = Number(mov.costoUnitario || 0);

      ////////////////////////////////////////////////////////
      // 🔥 SI ENTRA CON COSTO 0
      // USAR COSTO PROMEDIO ACTUAL
      ////////////////////////////////////////////////////////

      if (mov.entrada > 0 && costoMovimiento <= 0) {
        costoMovimiento = costoPromedio;
      }

      ////////////////////////////////////////////////////////
      // 🔥 TOTAL ENTRADA
      ////////////////////////////////////////////////////////

      const entradaTotal = mov.entrada * costoMovimiento;

      ////////////////////////////////////////////////////////
      // 🔥 ENTRADAS
      ////////////////////////////////////////////////////////

      if (mov.entrada > 0) {
        saldoTotal += entradaTotal;

        saldoCantidad += mov.entrada;

        costoPromedio =
          saldoCantidad > 0 ? saldoTotal / saldoCantidad : costoMovimiento;
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

        codigoMovimiento: mov.codigoMovimiento || "",

        detalle: mov.detalle,

        entrada: mov.entrada,

        salida: mov.salida,

        saldoCantidad,

        costoUnitario: mov.entrada > 0 ? costoMovimiento : costoPromedio,

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

  console.log("✅ Kardex generado:", resultado.length, "productos");

  return resultado;
};

export const getKardexRepository = async (body: any) => {
  const {
    fromDate,
    toDate,
    sucursal,
    linea,
    marca,
    groupBy,
  } = body;

  ////////////////////////////////////////////////////////////
  // 🔥 FECHAS
  ////////////////////////////////////////////////////////////

  const from = new Date(`${fromDate}T00:00:00`);

  const to = new Date(`${toDate}T23:59:59`);

  ////////////////////////////////////////////////////////////
  // 🔥 VENTAS
  ////////////////////////////////////////////////////////////

  const sales = await prisma.saleDetail.findMany({
    where: {
      sale: {
        status: "ACTIVE",

        date: {
          gte: from,
          lte: to,
        },

        ...(sucursal &&
          sucursal !== "" && {
            locationId: Number(sucursal),
          }),
      },

      product: {
        ...(linea &&
          linea !== "" && {
            lineId: Number(linea),
          }),

        ...(marca &&
          marca.trim() !== "" && {
            brandName: {
              contains: marca,
              mode: "insensitive",
            },
          }),
      },
    },

    include: {
      sale: {
        include: {
          employee: true,
          location: true,
          details: true,
        },
      },

      product: {
        include: {
          line: true,
        },
      },
    },
  });

  ////////////////////////////////////////////////////////////
  // 🔥 GROUPED
  ////////////////////////////////////////////////////////////

  const grouped: any = {};

  for (const item of sales) {
    const seller =
      `${item.sale.employee.name} ${item.sale.employee.lastName}`;

    const branch = item.sale.location.name;

    const line = item.product.line?.name || "Sin línea";

    const brand = item.product.brandName || "Sin marca";

    //////////////////////////////////////////////////////////
    // 🔥 GROUP
    //////////////////////////////////////////////////////////

    let group = "GENERAL";

    if (groupBy === "seller") {
      group = seller;
    }

    if (groupBy === "line") {
      group = line;
    }

    if (groupBy === "brand") {
      group = brand;
    }

    if (groupBy === "branch") {
      group = branch;
    }

    //////////////////////////////////////////////////////////
    // 🔥 KEY
    //////////////////////////////////////////////////////////

    const key = `${group}-${item.product.id}`;

    //////////////////////////////////////////////////////////
    // 🔥 INIT
    //////////////////////////////////////////////////////////

    if (!grouped[key]) {
      grouped[key] = {
        id: key,

        group: groupBy ? group : null,

        product: item.product.name,

        line,

        brand,

        seller,

        branch,

        barcode: item.product.barcode,

        quantity: 0,

        subtotal: 0,

        discount: 0,

        total: 0,
      };
    }

    //////////////////////////////////////////////////////////
    // 🔥 SUBTOTAL ITEM
    //////////////////////////////////////////////////////////

    const itemSubtotal =
      Number(item.quantity) * Number(item.price);

    //////////////////////////////////////////////////////////
    // 🔥 SUBTOTAL DE LA VENTA
    //////////////////////////////////////////////////////////

    const saleSubtotal = item.sale.details.reduce(
      (acc, detail) =>
        acc +
        Number(detail.quantity) *
          Number(detail.price),

      0,
    );

    //////////////////////////////////////////////////////////
    // 🔥 DESCUENTO TOTAL VENTA
    //////////////////////////////////////////////////////////

    const saleDiscount =
      Number(item.sale.discount || 0);

    //////////////////////////////////////////////////////////
    // 🔥 PRORRATEO
    //////////////////////////////////////////////////////////

    let itemDiscount = 0;

    if (saleSubtotal > 0 && saleDiscount > 0) {
      itemDiscount =
        (itemSubtotal / saleSubtotal) *
        saleDiscount;
    }

    //////////////////////////////////////////////////////////
    // 🔥 TOTAL NETO ITEM
    //////////////////////////////////////////////////////////

    const itemTotal =
      itemSubtotal - itemDiscount;

    //////////////////////////////////////////////////////////
    // 🔥 ACUMULAR
    //////////////////////////////////////////////////////////

    grouped[key].quantity += Number(item.quantity);

    grouped[key].subtotal += itemSubtotal;

    grouped[key].discount += itemDiscount;

    grouped[key].total += itemTotal;
  }

  ////////////////////////////////////////////////////////////
  // 🔥 RESULTADO
  ////////////////////////////////////////////////////////////

  const result = Object.values(grouped);

  ////////////////////////////////////////////////////////////
  // 🔥 LOGS
  ////////////////////////////////////////////////////////////

  const subtotal = result.reduce(
    (acc: number, item: any) =>
      acc + Number(item.subtotal || 0),

    0,
  );

  const discount = result.reduce(
    (acc: number, item: any) =>
      acc + Number(item.discount || 0),

    0,
  );

  const total = result.reduce(
    (acc: number, item: any) =>
      acc + Number(item.total || 0),

    0,
  );

  console.log("💰 SUBTOTAL:", subtotal);

  console.log("🏷️ DISCOUNT:", discount);

  console.log("✅ TOTAL:", total);

  return result;
};