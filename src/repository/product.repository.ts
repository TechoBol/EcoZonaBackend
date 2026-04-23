import prisma from '../config/db'

// Crear producto
export const createProductRepo = async (data: { name: any; description: any; barcode: any; imageUrl: any; price: any; finalPrice: any }) => {
  return await prisma.product.create({
    data
  })
}

// Buscar por barcode (clave para ventas)
export const getProductByBarcodeRepo = async (barcode: any) => {
  return await prisma.product.findUnique({
    where: { barcode }
  })
}