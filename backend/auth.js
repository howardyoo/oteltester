import dotenvFlow from "dotenv-flow";
import basicAuth from "basic-auth";

dotenvFlow.config();

const auth = (req, res, next) => {
  if (!process.env.USERNAME || !process.env.PASSWORD) {
    return next();
  }

  // if the request is from localhost, no need to perform authentication
  const ip = req.ip || req.connection.remoteAddress;
  if( ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return next();
  }

  const credentials = basicAuth(req);

  if (!credentials || 
      credentials.name !== process.env.USERNAME || 
      credentials.pass !== process.env.PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
    return res.status(401).send('Authentication required');
  }
  next();
};

export default auth;