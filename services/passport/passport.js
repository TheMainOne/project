import dotenv from 'dotenv';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import User from '../schemas/user.js';
dotenv.config();

const SECRET_KEY = process.env.SECRET_KEY;

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: SECRET_KEY,
};

passport.use(
  new JwtStrategy(
    {
      ...options,
      passReqToCallback: true, // Передаем req в коллбэк
    },
    async (req, jwtPayload, done) => {
      try {
        const user = await User.findById(jwtPayload.id);

        if (!user) {
          return done(null, false);
        }

        // Извлекаем токен из заголовка
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

        if (user.token !== token) {
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);


export default passport;
