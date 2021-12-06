const path = require('path');
const jsv = require('json-validator');
const errorsList = require(path.normalize(__dirname + '/../configs/statusListcode.json'));
const validateSchema = require(path.normalize(__dirname + '/../configs/validateSchema'));

module.exports = (req, res, next) => {
  try {
    jsv.validate(req.query, validateSchema.getTransactions, (err, messages) => {
      if(err) {
        console.error(err);
        res.status(500).json({
          success: false,
          message: errorsList['500']
        });
      }
      if (Object.keys(messages).length > 0) {
        res.status(200).json({
          success: false,
          message: 'Bad request',
          error: messages
        });
      } else {
        next();
      }
    })
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: errorsList['500']
    });
  }
}