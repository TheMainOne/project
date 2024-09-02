import passport from 'passport';

const authenticate = (req, res, next) => {
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
      if (err) {
        console.error("Authentication error:", err); 
        return res.status(500).json({ message: 'Internal Server Error', error: err.message });
      }
      if (!user) {
        const message = info ? info.message : 'Unauthorized';
        return res.status(401).json({ message: message });
      }
      req.user = user;
      next();
    })(req, res, next);
  };

export default authenticate;