import { Request, Response } from "express";
import {
  getEmployeesRepo,
  createEmployeeRepo,
  updateEmployeeRepo,
  deleteEmployeeRepo,
  getOneEmployeeToValidateToken,
  changePasswordRepository,
} from "../repository/employee.repository";
import bcrypt from "bcrypt";

//////////////////////////////
// 🔥 GET ALL
//////////////////////////////
export const getEmployees = async (_: Request, res: Response) => {
  try {
    const data = await getEmployeesRepo();
    return res.json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "error getting employees" });
  }
};

//////////////////////////////
// 🔥 CREATE
//////////////////////////////
export const createEmployee = async (req: Request, res: Response) => {
  try {
    const { name, lastName, email, password, roleId, locationId } = req.body;

    // 🔥 VALIDACIÓN BÁSICA
    if (!name || !lastName || !roleId) {
      return res.status(400).json({
        message: "name, lastName y roleId son obligatorios",
      });
    }

    // 🔐 CIFRAR PASSWORD
    let hashedPassword = null;

    if (password) {
      const saltRounds = 10; // puedes subirlo a 12 si quieres más seguridad
      hashedPassword = await bcrypt.hash(password, saltRounds);
    }

    const data = await createEmployeeRepo({
      name,
      lastName,
      email,
      password: hashedPassword, // 👈 aquí mandas el hash, NO el password original
      roleId,
      locationId,
    });

    return res.json(data);
  } catch (error: any) {
    console.error(error);

    if (error.code === "P2002") {
      return res.status(400).json({
        message: "El email ya está registrado",
      });
    }

    return res.status(500).json({ message: "error creating employee" });
  }
};

//////////////////////////////
// 🔥 UPDATE
//////////////////////////////
export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "id inválido" });
    }

    const { name, lastName, email, roleId, locationId, password } = req.body;
    let hashedPassword = null;

    if (password) {
      const saltRounds = 10; // puedes subirlo a 12 si quieres más seguridad
      hashedPassword = await bcrypt.hash(password, saltRounds);
    }
    const data = await updateEmployeeRepo(id, {
      name,
      lastName,
      email,
      roleId,
      locationId,
      password: hashedPassword,
    });

    return res.json(data);
  } catch (error: any) {
    console.error(error);

    if (error.code === "P2002") {
      return res.status(400).json({
        message: "El email ya está en uso",
      });
    }

    return res.status(500).json({ message: "error updating employee" });
  }
};

//////////////////////////////
// 🔥 DELETE (SOFT DELETE)
//////////////////////////////
export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ message: "id inválido" });
    }

    const data = await deleteEmployeeRepo(id);

    return res.json({
      message: "Empleado eliminado correctamente",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "error deleting employee" });
  }
};

//////////////////////////////
// 🔥 LOGIN VALIDATION (opcional)
//////////////////////////////
export const validateEmployee = async (req: Request, res: Response) => {
  try {
    const { id, password } = req.body;

    if (!id || !password) {
      return res.status(400).json({
        message: "id y password son requeridos",
      });
    }

    const data = await getOneEmployeeToValidateToken(id, password);

    if (!data) {
      return res.status(401).json({
        message: "credenciales inválidas",
      });
    }

    return res.json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "error validating employee" });
  }
};

//////////////////////////////
// 🔥 CHANGE PASSWORD
//////////////////////////////
export const changePassword = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body;

    if (!id || !newPassword) {
      return res.status(400).json({
        message: "id y newPassword son requeridos",
      });
    }

    const data = await changePasswordRepository(id, newPassword);

    return res.json({
      message: "Contraseña actualizada correctamente",
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "error changing password" });
  }
};
