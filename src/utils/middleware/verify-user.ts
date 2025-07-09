import { verify } from "jsonwebtoken";
import { UserModel } from "src/models/user.model";

export const verifyUser = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "You are not authorized." });
  }

  try {
    const payload: any = verify(token, process.env.JWT_SECRET!);

    let user = await UserModel.findById(payload.userId);
    if (user != null) {
      req.body.user = user._id;
      req.body.userRole = payload.type;
      return next();
    } else {
      res
        .status(401)
        .json({ success: false, message: "You are not authorized." });
    }
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};
