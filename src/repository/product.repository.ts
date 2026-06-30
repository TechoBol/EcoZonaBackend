import prisma from "../config/db";

type CreateProductDTO = {
  name: string;
  description?: string;
  barcode?: string | null;
  productCode?: string | null;
  imageUrl?: string;
  price: number;
  finalPrice: number;
  lineId: number;
  brandName: string;
};

// 🔥 CREAR PRODUCTO
export const createProductRepo = async (data: CreateProductDTO) => {
  const cost = Number(data.price);

  const salePrice = Number(data.finalPrice);

  const IVA = 0.1494;

  const costWithIVA = cost * (1 + IVA);

  const porcentajeGanancia =
    costWithIVA > 0
      ? Number((((salePrice - costWithIVA) / costWithIVA) * 100).toFixed(2))
      : 0;

  return prisma.product.create({
    data: {
      ...data,
      porcentajeGanancia,
    },
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
    // 🔥 CALCULAR % GANANCIA
    // ==========================================
    const cost = Number(productData.price);

    const salePrice = Number(productData.finalPrice);

    const IVA = 0.1494;

    const costWithIVA = cost * (1 + IVA);

    const porcentajeGanancia =
      costWithIVA > 0
        ? Number((((salePrice - costWithIVA) / costWithIVA) * 100).toFixed(2))
        : 0;

    // ==========================================
    // 🔥 UPDATE PRODUCTO
    // ==========================================
    await tx.product.update({
      where: { id },
      data: {
        name: productData.name,
        description: productData.description,
        barcode: productData.barcode?.trim() || null,
        productCode: productData.productCode?.trim() || null,
        price: productData.price,
        finalPrice: productData.finalPrice,
        porcentajeGanancia,
        imageUrl: productData.imageUrl,
        lineId: productData.lineId,
        brandName: productData.brandName,
      },
    });

    // ==========================================
    // 🔥 CONTROL INVENTARIO
    // ==========================================
    if (inventoryEdited) {
      if (stock !== undefined && locationId) {
        const inventory = await tx.inventory.findUnique({
          where: {
            productId_locationId: {
              productId: id,
              locationId,
            },
          },
        });

        if (!inventory) {
          await tx.inventory.create({
            data: {
              productId: id,
              locationId,
              quantity: stock,
              averageCost: productData.price,
            },
          });

          await tx.stockMovement.create({
            data: {
              productId: id,
              toLocationId: locationId,
              quantity: stock,
              type: "IN",
              unitCost: productData.price,
              reference: "STOCK INICIAL",
            },
          });
        } else {
          await tx.inventory.update({
            where: {
              productId_locationId: {
                productId: id,
                locationId,
              },
            },
            data: {
              quantity: stock,
              averageCost: productData.price,
            },
          });

          const initialMovement = await tx.stockMovement.findFirst({
            where: {
              productId: id,
              toLocationId: locationId,
              reference: "STOCK INICIAL",
            },
          });

          if (initialMovement) {
            await tx.stockMovement.update({
              where: {
                id: initialMovement.id,
              },
              data: {
                quantity: stock,
                unitCost: productData.price,
              },
            });
          }
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
  console.log("📥 INPUT:", { productId, fromDate, toDate, locationId });

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
      ...(productId && { id: productId }),
      ...(linea && { lineId: linea }),
      ...(marca &&
        marca.trim() !== "" && {
          brandName: { contains: marca, mode: "insensitive" },
        }),
    },
    include: { line: true },
  });

  ////////////////////////////////////////////////////////////
  // 🔥 MOVIMIENTOS DEL RANGO
  ////////////////////////////////////////////////////////////

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(productId && { productId }),
      ...(locationId && {
        OR: [{ fromLocationId: locationId }, { toLocationId: locationId }],
      }),
      ...(from && to && { createdAt: { gte: from, lte: to } }),
    },
    include: {
      product: { include: { line: true } },
      transfer: true,
      fromLocation: true,
      toLocation: true,
    },
    orderBy: { createdAt: "asc" },
  });

  ////////////////////////////////////////////////////////////
  // 🔥 MOVIMIENTOS ANTERIORES AL RANGO (para saldo inicial)
  ////////////////////////////////////////////////////////////

  const movimientosAnteriores = from
    ? await prisma.stockMovement.findMany({
        where: {
          ...(productId && { productId }),
          ...(locationId && {
            OR: [{ fromLocationId: locationId }, { toLocationId: locationId }],
          }),
          createdAt: { lt: from },
        },
        include: {
          transfer: true,
          fromLocation: true,
          toLocation: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

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
        ...(locationId && { locationId }),
      },
    });

    const stockActual = inventory.reduce((acc, inv) => acc + inv.quantity, 0);

    const inventoryCost =
      inventory.length > 0
        ? inventory.reduce((acc, inv) => acc + inv.averageCost, 0) /
          inventory.length
        : product.price;

    //////////////////////////////////////////////////////////
    // 🔥 CALCULAR SALDO INICIAL (movimientos ANTES del rango)
    //////////////////////////////////////////////////////////

    let saldoCantidad = 0;
    let saldoTotal = 0;
    let costoPromedio = 0;

    if (from) {
      const movsPrevios = movimientosAnteriores.filter(
        (m) => m.productId === product.id,
      );

      for (const mov of movsPrevios) {
        let entrada = 0;
        let salida = 0;
        let costo = Number(mov.unitCost || 0);

        if (mov.type === "IN") {
          entrada = mov.quantity;
        } else if (mov.type === "OUT") {
          salida = mov.quantity;
        } else if (mov.type === "TRANSFER") {
          if (locationId) {
            if (mov.toLocationId === locationId) entrada = mov.quantity;
            if (mov.fromLocationId === locationId) salida = mov.quantity;
          }
          // Global: transferencias se anulan entre sí, no afectan stock total
        }

        if (entrada > 0) {
          if (costo <= 0) costo = costoPromedio;
          saldoTotal += entrada * costo;
          saldoCantidad += entrada;
          costoPromedio =
            saldoCantidad > 0 ? saldoTotal / saldoCantidad : costo;
        }

        if (salida > 0) {
          const salidaTotal = salida * costoPromedio;
          saldoCantidad -= salida;
          saldoTotal -= salidaTotal;
        }
      }
    }

    //////////////////////////////////////////////////////////
    // 🔥 MOVIMIENTOS DEL PRODUCTO EN EL RANGO
    //////////////////////////////////////////////////////////

    const movimientosProducto: any[] = [];

    for (const mov of movements.filter((m) => m.productId === product.id)) {
      let entrada = 0;
      let salida = 0;
      let detalle = "";
      let codigoMovimiento = "";

      if (mov.type === "IN") {
        entrada = mov.quantity;
        detalle = (mov.reference || "COMPRA / IMPORTACIÓN").toUpperCase();
      }

      if (mov.type === "OUT") {
        salida = mov.quantity;
        detalle = (mov.reference || "SALIDA").toUpperCase();
      }

      if (mov.type === "TRANSFER") {
        const transferCode = mov.transfer?.transferCode || `TR-${mov.id}`;
        const fromName = mov.fromLocation?.name?.toUpperCase() || "ORIGEN";
        const toName = mov.toLocation?.name?.toUpperCase() || "DESTINO";

        codigoMovimiento = transferCode;

        if (locationId) {
          if (mov.toLocationId === locationId) {
            entrada = mov.quantity;
            detalle = `TRANSFERENCIA ENTRADA ${transferCode} ${fromName} → ${toName}`;
          }
          if (mov.fromLocationId === locationId) {
            salida = mov.quantity;
            detalle = `TRANSFERENCIA SALIDA ${transferCode} ${fromName} → ${toName}`;
          }
        } else {
          movimientosProducto.push({
            fecha: mov.createdAt,
            codigoMovimiento: transferCode,
            detalle: `TRANSFERENCIA SALIDA ${transferCode} ${fromName} → ${toName}`.toUpperCase(),
            entrada: 0,
            salida: mov.quantity,
            costoUnitario: mov.unitCost || 0,
          });
          movimientosProducto.push({
            fecha: mov.createdAt,
            codigoMovimiento: transferCode,
            detalle: `TRANSFERENCIA ENTRADA ${transferCode} ${fromName} → ${toName}`.toUpperCase(),
            entrada: mov.quantity,
            salida: 0,
            costoUnitario: mov.unitCost || 0,
          });
          continue;
        }
      }

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
    // 🔥 SIN MOVIMIENTOS EN EL RANGO
    //////////////////////////////////////////////////////////

    if (movimientosProducto.length === 0) {
      // Si hay filtro de fecha y saldo inicial es 0, no mostrar el producto
      if (from && saldoCantidad <= 0) continue;

      const costoMostrar = costoPromedio || inventoryCost;

      resultado.push({
        producto: product.name,
        barcode: product.barcode,
        linea: product.line?.name || "-",
        marca: product.brandName || "-",
        kardex: [
          {
            fecha: from ?? new Date(),
            codigoMovimiento: "",
            detalle: from ? "SALDO INICIAL" : "SIN MOVIMIENTOS",
            entrada: 0,
            salida: 0,
            saldoCantidad: from ? saldoCantidad : stockActual,
            costoUnitario: costoMostrar,
            entradaTotal: 0,
            salidaTotal: 0,
            saldoTotal: from
              ? saldoTotal || saldoCantidad * costoMostrar
              : stockActual * inventoryCost,
          },
        ],
      });

      continue;
    }

    //////////////////////////////////////////////////////////
    // 🔥 KARDEX
    //////////////////////////////////////////////////////////

    const kardexProducto: any[] = [];

    ////////////////////////////////////////////////////////
    // 🔥 FILA DE SALDO INICIAL (solo si hay filtro de fecha y saldo > 0)
    ////////////////////////////////////////////////////////

    if (from && saldoCantidad > 0) {
      const costoInicialMostrar = costoPromedio || inventoryCost;

      kardexProducto.push({
        fecha: from,
        codigoMovimiento: "",
        detalle: "SALDO INICIAL",
        entrada: 0,
        salida: 0,
        saldoCantidad,
        costoUnitario: costoInicialMostrar,
        entradaTotal: 0,
        salidaTotal: 0,
        saldoTotal: saldoTotal || saldoCantidad * costoInicialMostrar,
      });
    }

    ////////////////////////////////////////////////////////
    // 🔥 MOVIMIENTOS DEL PERÍODO
    ////////////////////////////////////////////////////////

    for (const mov of movimientosProducto) {
      let costoMovimiento = Number(mov.costoUnitario || 0);

      if (mov.entrada > 0 && costoMovimiento <= 0) {
        costoMovimiento = costoPromedio || inventoryCost;
      }

      const entradaTotal = mov.entrada * costoMovimiento;

      if (mov.entrada > 0) {
        saldoTotal += entradaTotal;
        saldoCantidad += mov.entrada;
        costoPromedio =
          saldoCantidad > 0 ? saldoTotal / saldoCantidad : costoMovimiento;
      }

      let salidaTotal = 0;

      if (mov.salida > 0) {
        salidaTotal = mov.salida * costoPromedio;
        saldoCantidad -= mov.salida;
        saldoTotal -= salidaTotal;
      }

      kardexProducto.push({
        fecha: mov.fecha,
        codigoMovimiento: mov.codigoMovimiento || "",
        detalle: mov.detalle,
        entrada: mov.entrada,
        salida: mov.salida,
        saldoCantidad,
        costoUnitario:
          mov.entrada > 0 ? costoMovimiento : costoPromedio || inventoryCost,
        entradaTotal,
        salidaTotal,
        saldoTotal,
      });
    }

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
  ////////////////////////////////////////////////////////////
  // 🔥 ROUND
  ////////////////////////////////////////////////////////////

  const round = (value: number) => Number(Number(value || 0).toFixed(2));

  ////////////////////////////////////////////////////////////
  // 🔥 BODY
  ////////////////////////////////////////////////////////////

  const { fromDate, toDate, sucursal, linea, marca } = body;

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
        },
      },

      product: {
        include: {
          line: true,
        },
      },
    },

    orderBy: {
      saleId: "asc",
    },
  });
  console.log("Sucursales encontradas:", [
    ...new Set(sales.map((x) => x.sale.location.name)),
  ]);

  ////////////////////////////////////////////////////////////
  // 🔥 AGRUPAR POR VENTA
  ////////////////////////////////////////////////////////////

  const groupedSales = sales.reduce((acc: any, item) => {
    const saleId = item.sale.id;

    if (!acc[saleId]) {
      acc[saleId] = [];
    }

    acc[saleId].push(item);

    return acc;
  }, {});

  ////////////////////////////////////////////////////////////
  // 🔥 RESULT
  ////////////////////////////////////////////////////////////

  const result: any[] = [];

  ////////////////////////////////////////////////////////////
  // 🔥 RECORRER VENTAS
  ////////////////////////////////////////////////////////////

  Object.values(groupedSales).forEach((saleItems: any) => {
    ////////////////////////////////////////////////////////
    // 🔥 SALE
    ////////////////////////////////////////////////////////

    const sale = saleItems[0].sale;

    ////////////////////////////////////////////////////////
    // 🔥 SUBTOTAL VENTA
    ////////////////////////////////////////////////////////

    const saleSubtotal = round(
      saleItems.reduce(
        (acc: number, item: any) =>
          acc + Number(item.quantity) * Number(item.price),
        0,
      ),
    );

    ////////////////////////////////////////////////////////
    // 🔥 DESCUENTO TOTAL VENTA
    ////////////////////////////////////////////////////////

    const saleDiscount = round(Number(sale.discount || 0));

    ////////////////////////////////////////////////////////
    // 🔥 ACUMULADOR DESCUENTO
    ////////////////////////////////////////////////////////

    let accumulatedDiscount = 0;

    ////////////////////////////////////////////////////////
    // 🔥 RECORRER ITEMS
    ////////////////////////////////////////////////////////

    saleItems.forEach((item: any, index: number) => {
      ////////////////////////////////////////////////////
      // 🔥 INFO
      ////////////////////////////////////////////////////

      const seller = `${item.sale.employee.name} ${item.sale.employee.lastName}`;

      const branch = item.sale.location.name;

      const line = item.product.line?.name || "Sin línea";

      const brand = item.product.brandName || "Sin marca";

      ////////////////////////////////////////////////////
      // 🔥 COSTO ACTUAL
      ////////////////////////////////////////////////////

      const price = round(Number(item.product.price || 0));

      ////////////////////////////////////////////////////
      // 🔥 SUBTOTAL ITEM
      ////////////////////////////////////////////////////

      const subtotal = round(Number(item.quantity) * Number(item.price));

      ////////////////////////////////////////////////////
      // 🔥 PRECIO VENTA HISTÓRICO
      ////////////////////////////////////////////////////

      const finalPrice = round(subtotal / Number(item.quantity || 1));

      ////////////////////////////////////////////////////
      // 🔥 DESCUENTO
      ////////////////////////////////////////////////////

      let discount = 0;

      const isLast = index === saleItems.length - 1;

      if (saleSubtotal > 0 && saleDiscount > 0) {
        if (!isLast) {
          discount = round((subtotal / saleSubtotal) * saleDiscount);

          accumulatedDiscount += discount;
        } else {
          discount = round(saleDiscount - accumulatedDiscount);
        }
      }

      ////////////////////////////////////////////////////
      // 🔥 TOTAL
      ////////////////////////////////////////////////////

      const total = round(subtotal - discount);

      ////////////////////////////////////////////////////
      // 🔥 FECHAS
      ////////////////////////////////////////////////////

      const saleDate = new Date(item.sale.date);

      const date = saleDate.toLocaleDateString("es-BO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const month = saleDate.toLocaleDateString("es-BO", {
        year: "numeric",
        month: "long",
      });

      ////////////////////////////////////////////////////
      // 🔥 PUSH
      ////////////////////////////////////////////////////

      result.push({
        id: item.id,

        //////////////////////////////////////////////////
        // 🔥 PRODUCTO
        //////////////////////////////////////////////////

        name: item.product.name,

        product: item.product.name,

        barcode: item.product.barcode,

        //////////////////////////////////////////////////
        // 🔥 AGRUPACIONES
        //////////////////////////////////////////////////

        seller,

        branch,

        line,

        brand,

        //////////////////////////////////////////////////
        // 🔥 FECHAS
        //////////////////////////////////////////////////

        date,

        month,

        //////////////////////////////////////////////////
        // 🔥 CANTIDAD
        //////////////////////////////////////////////////

        quantity: Number(item.quantity || 0),

        //////////////////////////////////////////////////
        // 🔥 PRECIOS
        //////////////////////////////////////////////////

        price,

        finalPrice,

        //////////////////////////////////////////////////
        // 🔥 TOTALES
        //////////////////////////////////////////////////

        subtotal,

        discount,

        total,
      });
    });
  });

  ////////////////////////////////////////////////////////////
  // 🔥 LOGS
  ////////////////////////////////////////////////////////////

  const subtotal = round(
    result.reduce((acc, item) => acc + Number(item.subtotal || 0), 0),
  );

  const discount = round(
    result.reduce((acc, item) => acc + Number(item.discount || 0), 0),
  );

  const total = round(
    result.reduce((acc, item) => acc + Number(item.total || 0), 0),
  );

  console.log("💰 SUBTOTAL:", subtotal);

  console.log("🏷️ DISCOUNT:", discount);

  console.log("✅ TOTAL:", total);

  ////////////////////////////////////////////////////////////
  // 🔥 AGRUPAR PRODUCTOS POR BARCODE
  ////////////////////////////////////////////////////////////

  const groupedProducts: any = {};

  result.forEach((item) => {
    //////////////////////////////////////////////////////////
    // 🔥 KEY
    //////////////////////////////////////////////////////////

    const key = item.barcode;

    //////////////////////////////////////////////////////////
    // 🔥 INIT
    //////////////////////////////////////////////////////////

    if (!groupedProducts[key]) {
      groupedProducts[key] = {
        id: item.id,

        //////////////////////////////////////////////////////
        // 🔥 INFO
        //////////////////////////////////////////////////////

        name: item.name,

        product: item.product,

        barcode: item.barcode,

        //////////////////////////////////////////////////////
        // 🔥 RELACIONES
        //////////////////////////////////////////////////////

        seller: item.seller,

        branches: [],

        line: item.line,

        brand: item.brand,

        //////////////////////////////////////////////////////
        // 🔥 ARRAYS
        //////////////////////////////////////////////////////

        sellers: [],

        dates: [],

        details: [],

        //////////////////////////////////////////////////////
        // 🔥 TOTALES
        //////////////////////////////////////////////////////

        quantity: 0,

        subtotal: 0,

        discount: 0,

        total: 0,

        //////////////////////////////////////////////////////
        // 🔥 PRECIOS
        //////////////////////////////////////////////////////

        price: item.price,
      };
    }

    //////////////////////////////////////////////////////////
    // 🔥 ACUMULAR GENERALES
    //////////////////////////////////////////////////////////
    const existingBranch = groupedProducts[key].branches.find(
      (branch: any) => branch.name === item.branch,
    );

    if (existingBranch) {
      existingBranch.quantity += Number(item.quantity || 0);

      existingBranch.subtotal = round(
        existingBranch.subtotal + Number(item.subtotal || 0),
      );

      existingBranch.discount = round(
        existingBranch.discount + Number(item.discount || 0),
      );

      existingBranch.total = round(
        existingBranch.total + Number(item.total || 0),
      );
    } else {
      groupedProducts[key].branches.push({
        name: item.branch,

        quantity: Number(item.quantity || 0),

        subtotal: Number(item.subtotal || 0),

        discount: Number(item.discount || 0),

        total: Number(item.total || 0),
      });
    }
    groupedProducts[key].quantity += Number(item.quantity || 0);

    groupedProducts[key].subtotal = round(
      groupedProducts[key].subtotal + Number(item.subtotal || 0),
    );

    groupedProducts[key].discount = round(
      groupedProducts[key].discount + Number(item.discount || 0),
    );

    groupedProducts[key].total = round(
      groupedProducts[key].total + Number(item.total || 0),
    );

    //////////////////////////////////////////////////////////
    // 🔥 FECHAS
    //////////////////////////////////////////////////////////

    groupedProducts[key].dates.push({
      date: item.date,

      month: item.month,

      quantity: Number(item.quantity || 0),

      subtotal: Number(item.subtotal || 0),

      discount: Number(item.discount || 0),

      total: Number(item.total || 0),
    });

    //////////////////////////////////////////////////////////
    // 🔥 SELLERS
    //////////////////////////////////////////////////////////

    const existingSeller = groupedProducts[key].sellers.find(
      (seller: any) => seller.name === item.seller,
    );

    if (existingSeller) {
      existingSeller.quantity += Number(item.quantity || 0);

      existingSeller.subtotal = round(
        existingSeller.subtotal + Number(item.subtotal || 0),
      );

      existingSeller.discount = round(
        existingSeller.discount + Number(item.discount || 0),
      );

      existingSeller.total = round(
        existingSeller.total + Number(item.total || 0),
      );
    } else {
      groupedProducts[key].sellers.push({
        name: item.seller,

        quantity: Number(item.quantity || 0),

        subtotal: Number(item.subtotal || 0),

        discount: Number(item.discount || 0),

        total: Number(item.total || 0),
      });
    }

    //////////////////////////////////////////////////////////
    // 🔥 BUSCAR PRECIO
    //////////////////////////////////////////////////////////

    const existingPrice = groupedProducts[key].details.find(
      (detail: any) => Number(detail.finalPrice) === Number(item.finalPrice),
    );

    //////////////////////////////////////////////////////////
    // 🔥 SI EXISTE
    //////////////////////////////////////////////////////////

    if (existingPrice) {
      existingPrice.quantity += Number(item.quantity || 0);

      existingPrice.subtotal = round(
        existingPrice.subtotal + Number(item.subtotal || 0),
      );

      existingPrice.discount = round(
        existingPrice.discount + Number(item.discount || 0),
      );

      existingPrice.total = round(
        existingPrice.total + Number(item.total || 0),
      );
    }

    //////////////////////////////////////////////////////////
    // 🔥 NUEVO PRECIO
    //////////////////////////////////////////////////////////
    else {
      groupedProducts[key].details.push({
        finalPrice: item.finalPrice,

        quantity: Number(item.quantity || 0),

        subtotal: Number(item.subtotal || 0),

        discount: Number(item.discount || 0),

        total: Number(item.total || 0),
      });
    }
  });

  ////////////////////////////////////////////////////////////
  // 🔥 FORMATEAR
  ////////////////////////////////////////////////////////////

  const finalResult = Object.values(groupedProducts).map((item: any) => ({
    ...item,

    //////////////////////////////////////////////////////////
    // 🔥 PRECIO VENTA
    //////////////////////////////////////////////////////////

    finalPrice: item.details
      .map((detail: any) => `Bs ${Number(detail.finalPrice).toFixed(2)}`)
      .join(" / "),

    //////////////////////////////////////////////////////////
    // 🔥 CANTIDADES
    //////////////////////////////////////////////////////////

    quantityDetail: item.details
      .map((detail: any) => `${detail.quantity}`)
      .join(" / "),

    //////////////////////////////////////////////////////////
    // 🔥 SUBTOTALES
    //////////////////////////////////////////////////////////

    subtotalDetail: item.details
      .map((detail: any) => `Bs ${Number(detail.subtotal).toFixed(2)}`)
      .join(" / "),
  }));

  ////////////////////////////////////////////////////////////
  // 🔥 RETURN
  ////////////////////////////////////////////////////////////

  return finalResult;
};

type CrossInventoryDTO = {
  user: number;
  originProductCode: number;
  destinationProductCode: number;
  quantity: number;
  locationId: number;
  observacion: string;
};

export const crossInventoryRepo = async ({
  user,
  originProductCode,
  destinationProductCode,
  quantity,
  locationId,
  observacion,
}: CrossInventoryDTO) => {
  return prisma.$transaction(async (tx) => {
    //////////////////////////////////////////////////////
    // PRODUCTO ORIGEN
    //////////////////////////////////////////////////////

    const originInventory = await tx.inventory.findUnique({
      where: {
        productId_locationId: {
          productId: originProductCode,
          locationId,
        },
      },
    });

    if (!originInventory) {
      throw new Error("Producto origen no encontrado");
    }

    if (originInventory.quantity < quantity) {
      throw new Error("Stock insuficiente");
    }

    //////////////////////////////////////////////////////
    // PRODUCTO DESTINO
    //////////////////////////////////////////////////////

    const destinationInventory = await tx.inventory.findUnique({
      where: {
        productId_locationId: {
          productId: destinationProductCode,
          locationId,
        },
      },
    });

    //////////////////////////////////////////////////////
    // CREAR REGISTRO CRUCE
    //////////////////////////////////////////////////////

    const cross = await tx.inventoryCross.create({
      data: {
        employeeId: user,
        locationId,
        originProductId: originProductCode,
        destinationProductId: destinationProductCode,
        quantity,
        observation: observacion,
      },
    });

    const crossCode = `AINV-${cross.id}`;

    const updatedCross = await tx.inventoryCross.update({
      where: { id: cross.id },
      data: { code: crossCode },
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
        originProduct: {
          select: {
            id: true,
            name: true,
            barcode: true,
          },
        },
        destinationProduct: {
          select: {
            id: true,
            name: true,
            barcode: true,
          },
        },
      },
    });

    //////////////////////////////////////////////////////
    // DESCONTAR ORIGEN
    //////////////////////////////////////////////////////

    await tx.inventory.update({
      where: {
        productId_locationId: {
          productId: originProductCode,
          locationId,
        },
      },
      data: {
        quantity: {
          decrement: quantity,
        },
      },
    });

    //////////////////////////////////////////////////////
    // SUMAR DESTINO
    //////////////////////////////////////////////////////

    if (destinationInventory) {
      await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: destinationProductCode,
            locationId,
          },
        },
        data: {
          quantity: {
            increment: quantity,
          },
        },
      });
    } else {
      const destinationProduct = await tx.product.findUnique({
        where: {
          id: destinationProductCode,
        },
      });

      await tx.inventory.create({
        data: {
          productId: destinationProductCode,
          locationId,
          quantity,
          averageCost: destinationProduct?.price || 0,
        },
      });
    }

    //////////////////////////////////////////////////////
    // MOVIMIENTO SALIDA
    //////////////////////////////////////////////////////

    await tx.stockMovement.create({
      data: {
        productId: originProductCode,
        fromLocationId: locationId,
        quantity,
        type: "OUT",
        reference: `AJUSTE INVENTARIO SALIDA ${crossCode}`,
      },
    });

    //////////////////////////////////////////////////////
    // MOVIMIENTO ENTRADA
    //////////////////////////////////////////////////////

    await tx.stockMovement.create({
      data: {
        productId: destinationProductCode,
        toLocationId: locationId,
        quantity,
        type: "IN",
        reference: `AJUSTE INVENTARIO ENTRADA ${crossCode}`,
      },
    });
    const originCost = originInventory.averageCost;

    const destinationCost = destinationInventory?.averageCost ?? 0;

    return {
      ...updatedCross,
      originAverageCost: originCost,
      destinationAverageCost: destinationCost,
    };
  });
};

export const getInventoryCrossesRepo = async (
  locationId: number,
  isManagement: boolean,
) => {
  const where = isManagement
    ? {}
    : {
        locationId,
      };

  return prisma.inventoryCross.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
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

      originProduct: {
        select: {
          id: true,
          name: true,
          barcode: true,
        },
      },

      destinationProduct: {
        select: {
          id: true,
          name: true,
          barcode: true,
        },
      },
    },
  });
};

export const getPublicProductsRepo = async (locationId: number) => {
  const products = await prisma.product.findMany({
    where: {
      isVisible: true,
    },

    select: {
      id: true,
      name: true,
      barcode: true,
      productCode: true,
      imageUrl: true,
      finalPrice: true,
      brandName: true,

      line: {
        select: {
          id: true,
          name: true,
        },
      },

      inventories: {
        where: {
          locationId,
        },

        select: {
          quantity: true,
        },

        take: 1,
      },
    },
  });

  return products
    .map((product) => ({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      productCode: product.productCode,
      imageUrl: product.imageUrl,
      finalPrice: product.finalPrice,
      brandName: product.brandName,
      line: product.line,

      stock: product.inventories.at(0)?.quantity || 0,
    }))
    .sort((a, b) => b.stock - a.stock);
};

export const getValuedInventoryRepo = async (
  locationId?: number,
  productId?: number,
  lineId?: number,
  brand?: string,
  hasta?: Date,
) => {
  //////////////////////////////////////////////////////
  // MOVIMIENTOS HASTA FECHA
  //////////////////////////////////////////////////////

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(productId && {
        productId,
      }),

      ...(hasta && {
        createdAt: {
          lte: hasta,
        },
      }),
    },

    include: {
      product: {
        include: {
          line: true,
        },
      },
    },

    orderBy: {
      createdAt: "asc",
    },
  });

  const grouped = new Map<number, any>();

  //////////////////////////////////////////////////////
  // RECONSTRUIR STOCK HISTÓRICO
  //////////////////////////////////////////////////////

  for (const movement of movements) {
    const product = movement.product;

    if (lineId && product.lineId !== lineId) continue;

    if (brand && product.brandName !== brand) continue;

    if (!grouped.has(product.id)) {
      grouped.set(product.id, {
        productId: product.id,

        codigo: product.barcode,

        descripcion: product.name,

        linea: product.line?.name || "",

        marca: product.brandName || "",

        cantidad: 0,

        precioProducto: Number(product.price),
      });
    }

    const item = grouped.get(product.id);

    //////////////////////////////////////////////////////
    // TODAS LAS SUCURSALES
    //////////////////////////////////////////////////////

    if (!locationId) {
      switch (movement.type) {
        case "IN":
          item.cantidad += movement.quantity;
          break;

        case "OUT":
          item.cantidad -= movement.quantity;
          break;

        case "TRANSFER":
          // No modifica stock global
          break;
      }

      continue;
    }

    //////////////////////////////////////////////////////
    // SUCURSAL ESPECÍFICA
    //////////////////////////////////////////////////////

    switch (movement.type) {
      case "IN":
        if (movement.toLocationId === locationId) {
          item.cantidad += movement.quantity;
        }
        break;

      case "OUT":
        if (movement.fromLocationId === locationId) {
          item.cantidad -= movement.quantity;
        }
        break;

      case "TRANSFER":
        if (movement.fromLocationId === locationId) {
          item.cantidad -= movement.quantity;
        }

        if (movement.toLocationId === locationId) {
          item.cantidad += movement.quantity;
        }
        break;
    }
  }

  //////////////////////////////////////////////////////
  // COSTOS DE INVENTARIO POR SUCURSAL
  //////////////////////////////////////////////////////

  let inventoryCostMap = new Map<number, number>();

  if (locationId) {
    const inventories = await prisma.inventory.findMany({
      where: {
        locationId,

        productId: {
          in: Array.from(grouped.keys()),
        },
      },

      select: {
        productId: true,
        averageCost: true,
      },
    });

    inventoryCostMap = new Map(
      inventories.map((i) => [i.productId, Number(i.averageCost)]),
    );
  }

  //////////////////////////////////////////////////////
  // RESULTADO FINAL
  //////////////////////////////////////////////////////

  return Array.from(grouped.values())
    .filter((item) => item.cantidad > 0)
    .map((item) => {
      ////////////////////////////////////////////////////
      // SUCURSAL -> COSTO PROMEDIO DEL INVENTARIO
      ////////////////////////////////////////////////////

      const costoUnitario = locationId
        ? inventoryCostMap.get(item.productId) || 0
        : Number(item.precioProducto);

      ////////////////////////////////////////////////////
      // TODAS -> COSTO DEL PRODUCTO
      ////////////////////////////////////////////////////

      return {
        productId: item.productId,

        codigo: item.codigo,

        descripcion: item.descripcion,

        linea: item.linea,

        marca: item.marca,

        cantidad: Number(item.cantidad),

        costoUnitario: Number(costoUnitario),

        valor: Number(item.cantidad * costoUnitario),
      };
    })
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion));
};
export const updateMargenProductRepo = async (
  id: number,
  porcentajeGanancia: number,
  quantityDiscount: number,
  bossDiscount: number,
) => {
  return prisma.$transaction(async (tx) => {
    //////////////////////////////////////////////////////
    // PRODUCTO
    //////////////////////////////////////////////////////
    const product = await tx.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new Error("Producto no encontrado");
    }

    //////////////////////////////////////////////////////
    // COSTO + IVA
    //////////////////////////////////////////////////////
    const cost = Number(product.price || 0);

    const IVA = 1.1494;

    const costIva = cost * IVA;

    //////////////////////////////////////////////////////
    // PRECIO EJECUTIVO
    //////////////////////////////////////////////////////
    const finalPrice = Number(
      (costIva * (1 + Number(porcentajeGanancia || 0) / 100)).toFixed(2),
    );

    //////////////////////////////////////////////////////
    // UPDATE
    //////////////////////////////////////////////////////
    const updatedProduct = await tx.product.update({
      where: { id },
      data: {
        porcentajeGanancia: Number(porcentajeGanancia),
        quantityDiscount: Number(quantityDiscount),
        bossDiscount: Number(bossDiscount),
        finalPrice,
      },
      include: {
        line: true,
        inventories: {
          include: {
            location: true,
          },
        },
      },
    });

    return updatedProduct;
  });
};
