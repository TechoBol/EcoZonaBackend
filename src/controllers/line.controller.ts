import { Request, Response } from "express";
import {
  getLinesRepo,
  createLinesRepo,
  updateLinesRepo,
  deleteLinesRepo,
  addBrandRepo,
  updateBrandRepo,
  deleteBrandRepo,
} from "../repository/line.repository";

export const getLines = async (_: Request, res: Response) => {
  const data = await getLinesRepo();
  return res.json(data);
};

export const createLines = async (req: Request, res: Response) => {
  try {
    const data = await createLinesRepo(req.body);
    return res.json(data);
  } catch (error: any) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const updateLines = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const data = await updateLinesRepo(id, req.body);
    return res.json(data);
  } catch (error: any) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const deleteLines = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await deleteLinesRepo(id);
  return res.json({ message: "Línea eliminada" });
};

// --- BRANDS ---

export const addBrand = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "El nombre de la marca es obligatorio" });
  }

  try {
    const data = await addBrandRepo(id, name);
    return res.json(data);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

export const updateBrand = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { oldName, newName } = req.body;

  if (!oldName || !newName) {
    return res.status(400).json({ message: "oldName y newName son obligatorios" });
  }

  try {
    const data = await updateBrandRepo(id, oldName, newName);
    return res.json(data);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

export const deleteBrand = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "El nombre de la marca es obligatorio" });
  }

  try {
    const data = await deleteBrandRepo(id, name);
    return res.json(data);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};