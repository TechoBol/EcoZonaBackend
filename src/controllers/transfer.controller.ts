import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  approveTransferRepo,
  createTransferRepo,
  getTransfersByLocationRepo,
  rejectTransferRepo,
  updateTransferRepo,
} from "../repository/transfer.repository";

export const createTransfer = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const {origenId, destinationId, items ,glosa } = req.body;

    if (!items?.length) {
      return res.status(400).json({ message: "Items requeridos" });
    }

    const data = await createTransferRepo({
      requestedById: user.id,
      toLocationId: destinationId ? destinationId : user.locationId,
      fromLocationId: origenId ? origenId : 1,
      items,
      glosa,
    });
    let dataAprobado
    /*if (destinationId) {
      dataAprobado = await approveTransferRepo(data.id, user.id, 1)
    }*/
    return res.json(dataAprobado ? dataAprobado : data);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "error creating request" });
  }
};

export const getMyTransfers = async (_req: Request, res: Response) => {
  //const token = req.headers["x-access-token"] as string;
  //const user = jwt.verify(token, process.env.JWTSECRET!) as any;

  const data = await getTransfersByLocationRepo();

  res.json(data);
};

export const approveTransfer = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const { id } = req.params;
    const { fromLocationId } = req.body;

    if (!fromLocationId) {
      return res.status(400).json({ message: "Falta origen" });
    }

    const data = await approveTransferRepo(Number(id), user.id, fromLocationId);

    return res.json(data);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

export const rejectTransfer = async (req: Request, res: Response) => {
  try {
    const token = req.headers["x-access-token"] as string;
    const user = jwt.verify(token, process.env.JWTSECRET!) as any;

    const { id } = req.params;
    const { rejectionReason } = req.body;
    console.log (rejectionReason)
    const data = await rejectTransferRepo(
      Number(id),
      user.id,
      rejectionReason,
    );

    res.json(data);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const updateTransfer = async (
  req: Request,
  res: Response,
) => {
  try {
    const token = req.headers["x-access-token"] as string;

    jwt.verify(token, process.env.JWTSECRET!) as any;

    const { id } = req.params;

    const {
      destinationId,
      items,
      glosa,
    } = req.body;

    if (!items?.length) {
      return res.status(400).json({
        message: "Items requeridos",
      });
    }

    const data = await updateTransferRepo(
      Number(id),
      {
        toLocationId: destinationId,
        items,
        glosa,
      },
    );

    return res.json(data);
  } catch (error: any) {
    return res.status(400).json({
      message: error.message,
    });
  }
};