import prisma from '../config/db.js'

// Crear producto
export const createProductRepo = async (data) => {
  return await prisma.product.create({
    data
  })
}

// Buscar por barcode (clave para ventas)
export const getProductByBarcodeRepo = async (barcode) => {
  return await prisma.product.findUnique({
    where: { barcode }
  })
}