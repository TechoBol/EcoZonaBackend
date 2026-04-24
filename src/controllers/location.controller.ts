import { Request, Response } from "express";
import {
  getAllLocationsRepository,
  createLocationRepository,
  updateLocationRepository,
  deleteLocationRepository,
} from "../repository/location.repository";

export const getLocations = async (_req: Request, res: Response) => {
  try {
    const data = await getAllLocationsRepository();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener sucursales" });
  }
};

export const createLocation = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const created = await createLocationRepository(data);
    return res.json(created);
  } catch (error) {
    return res.status(500).json({ message: "Error al crear sucursal" });
  }
};

export const updateLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updated = await updateLocationRepository(Number(id), req.body);
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: "Error al actualizar" });
  }
};

export const deleteLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await deleteLocationRepository(Number(id));
    return res.json({ message: "Eliminado" });
  } catch (error) {
    return res.status(500).json({ message: "Error al eliminar" });
  }
};