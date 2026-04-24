const jwt = require('jsonwebtoken')
const User = require('../models/User')

const COOKIE_NAME = process.env.COOKIE_NAME || 'mw_token'

const extractToken = (req) => {
  const bearerHeader = req.headers.authorization || ''
  const bearerToken = bearerHeader.startsWith('Bearer ')
    ? bearerHeader.slice(7).trim()
    : null

  const cookieToken = req.cookies?.[COOKIE_NAME]

  return bearerToken || cookieToken || null
}

const authMiddleware = async (req, res, next) => {
  try {
    const { JWT_SECRET } = process.env

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT_SECRET is missing' })
    }

    const token = extractToken(req)

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const decoded = jwt.verify(token, JWT_SECRET)

    if (!decoded?.id) {
      return res.status(401).json({ message: 'Invalid token' })
    }

    const user = await User.findById(decoded.id).select('-password')
    if (!user) {
      return res.status(401).json({ message: 'User not found' })
    }

    req.user = user
    return next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired, please login again' })
    }

    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' })
  }

  if (Number(req.user.isAdmin) !== 1) {
    return res.status(403).json({ message: 'Admin access required' })
  }

  return next()
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  COOKIE_NAME,
}