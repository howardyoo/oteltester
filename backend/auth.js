import dotenvFlow from "dotenv-flow";
import basicAuth from "basic-auth";

dotenvFlow.config();

const auth = (req, res, next) => {
  if (!process.env.USERNAME || !process.env.PASSWORD) {
    return next();
  }

  // if the request is from localhost, no need to perform authentication
  // get the request's client 
  const agent = req.headers['user-agent'];
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const isLocal = clientIp.startsWith('127.') || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('::1');

  if( (isLocal) && ( agent && agent.startsWith('OpenTelemetry Collector'))) {
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