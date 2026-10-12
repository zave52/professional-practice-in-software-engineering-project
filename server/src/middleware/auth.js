import jwt from 'jsonwebtoken';

const getSecret = () => {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET is not configured.');
    error.status = 500;
    throw error;
  }
  return process.env.JWT_SECRET;
};

export default function auth(req, res, next) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ status: 401, message: 'Bearer token is required.' });
  }

  try {
    req.user = jwt.verify(token, getSecret());
    if (!Number.isInteger(Number(req.user.id)) || Number(req.user.id) <= 0) {
      return res.status(401).json({ status: 401, message: 'Token does not contain a valid user id.' });
    }
    req.user.id = Number(req.user.id);
    return next();
  } catch (error) {
    if (error.status === 500) {
      return next(error);
    }
    return res.status(401).json({ status: 401, message: 'Invalid or expired bearer token.' });
  }
}
