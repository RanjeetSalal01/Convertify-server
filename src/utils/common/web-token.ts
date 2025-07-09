import { sign, verify } from "jsonwebtoken";

export const createAccessToken = async (
  userId: any,
  type: string
): Promise<string> => {
  let token = sign({ userId, type }, process.env.ACCESS_TOKEN_SECRET!, {
    expiresIn: "1d",
  });
  return token;
};
