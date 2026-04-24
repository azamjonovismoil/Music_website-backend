const jwt = require('jsonwebtoken')
const User = require('../models/User')

const COOKIE_NAME = process.env.COOKIE_NAME || 'mw_token'

const authMiddleware = async (req, res, next) => {
  try {
    const JWT_SECRET = process.env.JWT_SECRET

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT_SECRET is missing' })
    }

    const bearerHeader = req.headers.authorization || ''
    const bearerToken = bearerHeader.startsWith('Bearer ')
      ? bearerHeader.slice(7)
      : null

    const cookieToken = req.cookies?.[COOKIE_NAME]
    const token = bearerToken || cookieToken

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const decoded = jwt.verify(token, JWT_SECRET)

    const user = await User.findById(decoded.id).select('-password')
    if (!user) {
      return res.status(401).json({ message: 'User not found' })
    }

    req.user = user
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Session expired, please login again' })
  }
}

const adminMiddleware = (req, res, next) => {
  if (!req.user || Number(req.user.isAdmin) !== 1) {
    return res.status(403).json({ message: 'Admin access required' })
  }

  return next()
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  COOKIE_NAME,
}