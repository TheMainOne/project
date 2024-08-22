const errorHandler = (err, req, res, next) => {
    const { status = 500, message = 'Server Error' } = err;
    res.status(status).json({
      status: 'fail',
      code: status,
      message,
      data: message === 'Server Error' ? 'Internal Server Error' : message,
    });
  };
  
  export default errorHandler;