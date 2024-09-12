const errorHandler = (err, req, res, next) => {
    const { status = 500, message = 'Server Error' } = err;

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', code: 401, message: 'Token is expired' });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ status: 'error', code: 401, message: 'invalid signature' });
    }



    res.status(status).json({
      status: 'fail',
      code: status,
      message,
      data: message === 'Server Error' ? 'Internal Server Error' : message,
    });
  };
  
  export default errorHandler;