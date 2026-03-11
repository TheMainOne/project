import jwt from "jsonwebtoken";

export function signAccess(payload) {
  const secret = process.env.JWT_ACCESS_SECRET;
  const expiresIn = process.env.JWT_ACCESS_EXPIRES || '15m';
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is missing. Check your environment variables and dotenv loading order.');
  }
  return jwt.sign(payload, secret, { expiresIn: expiresIn });
}


export function signRefresh(payload) {
  const secret = process.env.JWT_REFRESH_SECRET;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES || '30d';
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is missing.');
  }
  return jwt.sign(payload, secret, { expiresIn: expiresIn });
}

export const verifyAccess = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

export const verifyRefresh = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET);


export function signExtensionAccess(payload) {
  const secret = process.env.JWT_ACCESS_SECRET;
  const expiresIn = process.env.JWT_EXTENSION_ACCESS_EXPIRES || "4h";
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is missing. Check your environment variables and dotenv loading order.");
  }
  return jwt.sign(payload, secret, { expiresIn });
}

export const verifyExtensionAccess = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

  if (decoded.type !== "extension") {
    throw new Error("Invalid token type");
  }

  return decoded;
};