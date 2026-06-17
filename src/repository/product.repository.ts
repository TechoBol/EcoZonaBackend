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
        ? Number(
            (
              ((salePrice - costWithIVA) / costWithIVA) *
              100
            ).toFixed(2)
          )
        : 0;

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
) => {
  const where: any = {
    quantity: { gt: 0 },
  };

  if (locationId) where.locationId = locationId;
  if (productId) where.productId = productId;

  const productWhere: any = {};

  if (lineId) productWhere.lineId = lineId;
  if (brand) productWhere.brandName = brand;

  const inventory = await prisma.inventory.findMany({
    where: {
      ...where,
      ...(Object.keys(productWhere).length > 0
        ? { product: productWhere }
        : {}),
    },

    include: {
      location: {
        select: {
          id: true,
          name: true,
        },
      },

      product: {
        select: {
          id: true,
          code: true,
          name: true,
          brandName: true,

          price: true, // 👈 COSTO GLOBAL

          line: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },

    orderBy: {
      product: {
        name: "asc",
      },
    },
  });

  //////////////////////////////////////////////////////
  // 🏢 SUCURSAL ESPECÍFICA
  //////////////////////////////////////////////////////

  if (locationId) {
    return inventory.map((item) => ({
      productId: item.product.id,

      codigo: item.product.code,
      descripcion: item.product.name,
      linea: item.product.line?.name || "",
      marca: item.product.brandName || "",

      unidad: "BASE",

      cantidad: item.quantity,

      costoUnitario: Number(item.averageCost),

      valor: Number(item.quantity * item.averageCost),

      locationId: item.location.id,
      locationName: item.location.name,
    }));
  }

  //////////////////////////////////////////////////////
  // 🌎 TODAS LAS SUCURSALES
  //////////////////////////////////////////////////////

  const grouped = new Map();

  inventory.forEach((item) => {
    const key = item.product.id;

    if (!grouped.has(key)) {
      grouped.set(key, {
        productId: item.product.id,
        codigo: item.product.code,
        descripcion: item.product.name,
        linea: item.product.line?.name || "",
        marca: item.product.brandName || "",

        cantidad: 0,

        costoUnitario: item.product.price, // 👈 COSTO GLOBAL
      });
    }

    const current = grouped.get(key);

    current.cantidad += item.quantity;
  });

  return Array.from(grouped.values()).map((item: any) => ({
    productId: item.productId,
    codigo: item.codigo,
    descripcion: item.descripcion,
    linea: item.linea,
    marca: item.marca,

    cantidad: Number(item.cantidad),

    costoUnitario: Number(item.costoUnitario),

    valor: Number(item.cantidad * item.costoUnitario),
  }));
};