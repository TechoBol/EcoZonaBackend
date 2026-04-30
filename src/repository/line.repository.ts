import prisma from "../config/db";

export const getLinesRepo = async () => {
  return prisma.line.findMany({
    where: { isVisible: true },
    orderBy: { name: "asc" },
  });
};

export const createLinesRepo = async (data: any) => {
  return prisma.line.create({
    data: {
      name: data.name,
      description: data.description,
      brands: data.brands ?? [],
    },
  });
};

export const updateLinesRepo = async (id: number, data: any) => {
  return prisma.line.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
    },
  });
};

export const deleteLinesRepo = async (id: number) => {
  return prisma.line.update({
    where: { id },
    data: { isVisible: false },
  });
};

// --- BRANDS ---

export const addBrandRepo = async (id: number, brandName: string) => {
  const line = await prisma.line.findUnique({ where: { id } });
  if (!line) throw new Error("Línea no encontrada");

  const brands = line.brands as string[];

  if (brands.includes(brandName)) {
    throw new Error("La marca ya existe en esta línea");
  }

  return prisma.line.update({
    where: { id },
    data: { brands: [...brands, brandName] },
  });
};

export const updateBrandRepo = async (
  id: number,
  oldName: string,
  newName: string
) => {
  const line = await prisma.line.findUnique({ where: { id } });
  if (!line) throw new Error("Línea no encontrada");

  const brands = line.brands as string[];

  if (!brands.includes(oldName)) {
    throw new Error("La marca no existe en esta línea");
  }
  if (brands.includes(newName)) {
    throw new Error("Ya existe una marca con ese nombre");
  }

  const updatedBrands = brands.map((b) => (b === oldName ? newName : b));

  return prisma.line.update({
    where: { id },
    data: { brands: updatedBrands },
  });
};

export const deleteBrandRepo = async (id: number, brandName: string) => {
  const line = await prisma.line.findUnique({ where: { id } });
  if (!line) throw new Error("Línea no encontrada");

  const brands = line.brands as string[];

  if (!brands.includes(brandName)) {
    throw new Error("La marca no existe en esta línea");
  }

  const updatedBrands = brands.filter((b) => b !== brandName);

  return prisma.line.update({
    where: { id },
    data: { brands: updatedBrands },
  });
};