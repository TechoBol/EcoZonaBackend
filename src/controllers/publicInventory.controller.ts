import { Request, Response } from "express";
import prisma from "../config/db";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export const createPublicInventoryLink = async (
  req: Request,
  res: Response,
) => {
  try {
    const tokenRecibido = req.headers["x-access-token"] as string;

    const user = jwt.verify(
      tokenRecibido,
      process.env.JWTSECRET!,
    ) as any;

    // 🔥 token temporal único
    const tempToken = crypto.randomUUID();

    // 🔥 crear registro
    const link = await prisma.publicInventoryLink.create({
      data: {
        token: tempToken,
        employeeId: user.id,
        locationId: user.locationId,
      },
    });

    // 🔥 generar JWT público
    const publicToken = jwt.sign(
      {
        sellerId: user.id,
        locationId: user.locationId,
        publicLinkId: link.id,
        type: "public_inventory",
        email : user.email,
        level: 5,
      },
      process.env.JWTSECRET!,
    );

    // 🔥 guardar token real
    await prisma.publicInventoryLink.update({
      where: {
        id: link.id,
      },

      data: {
        token: publicToken,
      },
    });

    return res.json({
      token: publicToken,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Error creando link",
    });
  }
};